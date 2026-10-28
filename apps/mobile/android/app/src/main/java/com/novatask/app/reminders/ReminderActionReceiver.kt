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
        if (
            action != ReminderIntents.ACTION_COMPLETE &&
                action != ReminderIntents.ACTION_SNOOZE &&
                action != ReminderIntents.ACTION_DISMISS
        ) {
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
        if (action == ReminderIntents.ACTION_DISMISS && cached == null) {
            Log.w(TAG, "Ignoring dismissal for uncached reminder ${fallback.id}")
            return
        }
        val reminder = cached ?: fallback.copy(triggerAt = fallback.triggerAt.takeIf { it > 0 } ?: System.currentTimeMillis())
        val now = System.currentTimeMillis()
        val seq = intent.getIntExtra(ReminderIntents.EXTRA_TRIGGER_SEQ, 0)

        if (cached != null && cached.requestCode != fallback.requestCode) {
            Log.w(TAG, "Ignoring action with a stale request code for ${fallback.id}")
            return
        }

        // Dismissal is history only: it never completes the task, never cancels
        // a recurrence, and never feeds the scheduler.
        if (action == ReminderIntents.ACTION_DISMISS) {
            if (!ReminderPolicy.isDismissalForDeliveredAttempt(seq, reminder)) {
                Log.i(TAG, "Ignoring stale dismissal for ${reminder.id}")
                return
            }
            val dismissed = reminder.copy(dismissedSeq = seq, dismissedAt = now, updatedAt = now)
            store.update(reminder.id) { dismissed }
            queue.enqueue(
                NativeAction(
                    actionId = "$ACTION_DISMISS-${reminder.id}-$seq",
                    type = ACTION_DISMISS,
                    reminderId = reminder.id,
                    requestCode = reminder.requestCode,
                    occurredAt = now,
                    seq = seq,
                    title = reminder.title,
                    body = reminder.body,
                ),
            )
            ReminderIntents.cancelAlarm(context, reminder.id, reminder.requestCode)
            Log.i(TAG, "Dismissed reminder ${reminder.id} attempt $seq")
            return
        }

        if (!ReminderPolicy.isActionForCurrentAttempt(seq, reminder)) {
            Log.w(TAG, "Ignoring stale $action for ${reminder.id}")
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
                        seq = seq,
                        title = reminder.title,
                        body = reminder.body,
                    ),
                )
                Log.i(TAG, "Completed reminder ${reminder.id} from notification")
            }

            ReminderIntents.ACTION_SNOOZE -> {
                // Only the delivered attempt can be snoozed.
                if (seq > 0 && reminder.deliveredSeq < seq) {
                    Log.w(TAG, "Ignoring snooze for an undelivered attempt of ${reminder.id}")
                    return
                }
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
                        // A snooze is an absolute instant; never let a later
                        // zone/clock reschedule recompute the original wall time.
                        localDate = null,
                        localTime = null,
                        // A snooze is the only thing that starts a new attempt.
                        triggerSeq = reminder.triggerSeq + 1,
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
                        seq = seq,
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
