package com.novatask.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Fires a reminder notification and records delivery in the native cache. */
internal class ReminderAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ReminderIntents.ACTION_FIRE) return
        val pendingResult = goAsync()
        val appContext = context.applicationContext
        ReceiverWork.executor.execute {
            try {
                handle(appContext, intent)
            } catch (error: RuntimeException) {
                Log.e(TAG, "Reminder alarm receiver failed", error)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun handle(context: Context, intent: Intent) {
        val fallback = reminderFromIntent(intent) ?: run {
            Log.w(TAG, "Ignoring alarm without a reminder id")
            return
        }
        val store = ReminderAlarmStore(context)
        val cached = store.find(fallback.id)
        if (cached != null && cached.requestCode != fallback.requestCode) {
            // The reminder moved to a new request code during reconciliation.
            // A stale PendingIntent must not deliver against the new identity.
            Log.w(TAG, "Ignoring stale alarm for ${fallback.id}")
            return
        }
        val reminder = cached ?: fallback.copy(
            triggerAt = if (fallback.triggerAt > 0) fallback.triggerAt else System.currentTimeMillis(),
        )

        if (ReminderPolicy.isTerminal(reminder.status)) {
            ReminderNotifier(context).cancel(reminder)
            return
        }

        val delivery = ReminderNotifier(context).showReminder(reminder)
        val mode =
            when (delivery) {
                NotificationDelivery.POSTED -> "fired"
                NotificationDelivery.PERMISSION_DENIED -> "blocked-notification-permission"
                NotificationDelivery.CHANNEL_BLOCKED -> "blocked-notification-channel"
                NotificationDelivery.ERROR -> "error"
            }
        val deliveryState =
            when (delivery) {
                NotificationDelivery.POSTED -> "posted"
                NotificationDelivery.PERMISSION_DENIED -> "permission-denied"
                NotificationDelivery.CHANNEL_BLOCKED -> "channel-blocked"
                NotificationDelivery.ERROR -> "notify-failed"
            }

        val updated =
            reminder.copy(
                scheduleMode = mode,
                scheduleReason =
                    if (cached == null) {
                        "receiver-intent-fallback"
                    } else {
                        reminder.scheduleReason
                    },
                lastFiredAt = System.currentTimeMillis(),
                deliveryState = deliveryState,
                scheduledAt = null,
                updatedAt = System.currentTimeMillis(),
            )
        if (cached == null) {
            store.upsert(updated)
        } else {
            store.update(reminder.id) { updated }
        }
        Log.i(TAG, "Reminder ${reminder.id} delivery=$delivery")
    }

    private companion object {
        const val TAG = "NovaReminders"
    }
}
