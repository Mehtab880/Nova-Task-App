package com.novatask.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Handles Complete and Snooze notification actions without JS. The native cache
 * is updated immediately and a durable action is queued for SQLite.
 */
internal class ReminderActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != ReminderIntents.ACTION_COMPLETE && action != ReminderIntents.ACTION_SNOOZE) {
            return
        }
        val pendingResult = goAsync()
        val appContext = context.applicationContext
        ReceiverWork.executor.execute {
            try {
                handle(appContext, intent, action)
            } catch (error: RuntimeException) {
                Log.e(TAG, "Reminder action receiver failed", error)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun handle(context: Context, intent: Intent, action: String) {
        val fallback = reminderFromIntent(intent) ?: run {
            Log.w(TAG, "Ignoring action without a reminder id")
            return
        }
        val store = ReminderAlarmStore(context)
        val queue = ReminderActionQueue(context)
        val notifier = ReminderNotifier(context)
        val scheduler = ReminderScheduler(context, store)
        val cached = store.find(fallback.id)
        val reminder = cached ?: fallback.copy(triggerAt = fallback.triggerAt.takeIf { it > 0 } ?: System.currentTimeMillis())
        val now = System.currentTimeMillis()

        if (cached != null && cached.requestCode != fallback.requestCode) {
            Log.w(TAG, "Ignoring action with a stale request code for ${fallback.id}")
            return
        }

        if (ReminderPolicy.isTerminal(reminder.status)) {
            ReminderIntents.cancelAlarm(context, reminder.id, reminder.requestCode)
            notifier.cancel(reminder)
            return
        }

        when (action) {
            ReminderIntents.ACTION_COMPLETE -> {
                ReminderIntents.cancelAlarm(context, reminder.id, reminder.requestCode)
                notifier.cancel(reminder)
                val completed =
                    reminder.copy(
                        status = STATUS_COMPLETED,
                        scheduleMode = "completed",
                        scheduleReason = "completed-from-notification",
                        scheduledAt = null,
                        updatedAt = now,
                    )
                if (cached == null) store.upsert(completed) else store.update(reminder.id) { completed }
                queue.enqueue(
                    NativeAction(
                        actionId = ReminderPolicy.actionId(ACTION_COMPLETE, reminder.id, null),
                        type = ACTION_COMPLETE,
                        reminderId = reminder.id,
                        requestCode = reminder.requestCode,
                        occurredAt = now,
                        title = reminder.title,
                        body = reminder.body,
                    ),
                )
                Log.i(TAG, "Completed reminder ${reminder.id} from notification")
            }

            ReminderIntents.ACTION_SNOOZE -> {
                val duplicate =
                    cached != null &&
                        cached.status == STATUS_SCHEDULED &&
                        cached.triggerAt > now &&
                        queue.pending().any {
                            it.type == ACTION_SNOOZE && it.reminderId == reminder.id
                        }
                if (duplicate) {
                    // A repeat delivery of the same snooze action must not extend
                    // the snooze or cancel the new alarm.
                    Log.i(TAG, "Ignoring duplicate snooze for ${reminder.id}")
                    return
                }
                val minutes =
                    intent
                        .getIntExtra(ReminderIntents.EXTRA_SNOOZE_MINUTES, DEFAULT_SNOOZE_MINUTES)
                        .coerceIn(1, 60)
                val snoozedUntil = ReminderPolicy.nextSnoozeAt(now, minutes)
                notifier.cancel(reminder)
                ReminderIntents.cancelAlarm(context, reminder.id, reminder.requestCode)
                val snoozed =
                    reminder.copy(
                        triggerAt = snoozedUntil,
                        status = STATUS_SCHEDULED,
                        scheduleMode = "pending",
                        scheduleReason = "snoozed-from-notification",
                        scheduledAt = null,
                        lastFiredAt = null,
                        deliveryState = null,
                        updatedAt = now,
                    )
                if (cached == null) store.upsert(snoozed) else store.update(reminder.id) { snoozed }
                val outcome = scheduler.scheduleSingle(snoozed)
                store.update(reminder.id) { current ->
                    current.copy(
                        scheduleMode = outcome.state,
                        scheduleReason = outcome.reason ?: current.scheduleReason,
                        scheduledAt = outcome.scheduledFor,
                        updatedAt = System.currentTimeMillis(),
                    )
                }
                queue.enqueue(
                    NativeAction(
                        actionId = ReminderPolicy.actionId(ACTION_SNOOZE, reminder.id, snoozedUntil),
                        type = ACTION_SNOOZE,
                        reminderId = reminder.id,
                        requestCode = reminder.requestCode,
                        occurredAt = now,
                        snoozedUntil = snoozedUntil,
                        title = reminder.title,
                        body = reminder.body,
                    ),
                )
                Log.i(TAG, "Snoozed reminder ${reminder.id} until $snoozedUntil")
            }
        }
    }

    private companion object {
        const val TAG = "NovaReminders"
    }
}
