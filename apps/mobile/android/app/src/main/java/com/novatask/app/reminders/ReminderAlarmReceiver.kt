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
        if (cached == null) {
            // A fire intent for a schedule that is no longer cached is stale.
            // Never post from fallback extras: that is exactly how a dismissed
            // or replaced trigger would re-alert.
            Log.w(TAG, "Ignoring alarm for uncached reminder ${fallback.id}")
            return
        }
        if (cached.requestCode != fallback.requestCode) {
            // The reminder moved to a new request code during reconciliation.
            // A stale PendingIntent must not deliver against the new identity.
            Log.w(TAG, "Ignoring stale alarm for ${fallback.id}")
            return
        }
        val seq = intent.getIntExtra(ReminderIntents.EXTRA_TRIGGER_SEQ, 0)
        if (!ReminderPolicy.isDeliveryForCurrentAttempt(seq, cached)) {
            Log.w(TAG, "Ignoring alarm for a superseded attempt of ${cached.id}")
            return
        }

        if (ReminderPolicy.isTerminal(cached.status)) {
            ReminderNotifier(context).cancel(cached)
            return
        }

        val now = System.currentTimeMillis()
        val delivery = ReminderNotifier(context).showReminder(cached)
        val posted = delivery == NotificationDelivery.POSTED
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
            cached.copy(
                scheduleMode = mode,
                scheduleReason = if (posted) "notification-posted" else cached.scheduleReason,
                lastFiredAt = now,
                deliveryState = deliveryState,
                scheduledAt = null,
                // Delivery is recorded only for an attempt that was actually
                // posted. A scheduling success is not a delivery.
                deliveredSeq =
                    if (posted) maxOf(cached.deliveredSeq, cached.triggerSeq) else cached.deliveredSeq,
                updatedAt = now,
            )
        store.update(cached.id) { updated }
        Log.i(TAG, "Reminder ${cached.id} delivery=$delivery")
    }

    private companion object {
        const val TAG = "NovaReminders"
    }
}
