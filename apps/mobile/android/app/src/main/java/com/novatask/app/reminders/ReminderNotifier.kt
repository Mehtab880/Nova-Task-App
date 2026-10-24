package com.novatask.app.reminders

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.novatask.app.R

internal data class ChannelState(
    val exists: Boolean,
    val importance: Int,
    val blocked: Boolean,
)

/**
 * Owns the single M4 notification channel and renders reminder notifications.
 * Notification PendingIntents are created lazily at delivery time, so the alarm
 * cap does not also multiply the app's live PendingIntent count.
 */
internal class ReminderNotifier(private val context: Context) {

    private val manager = NotificationManagerCompat.from(context)

    fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null) return
        val channel =
            NotificationChannel(
                    CHANNEL_ID,
                    context.getString(R.string.notification_channel_reminders_name),
                    NotificationManager.IMPORTANCE_HIGH,
                )
                .apply {
                    description = context.getString(R.string.notification_channel_reminders_description)
                    enableVibration(false)
                    setShowBadge(true)
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
                }
        manager.createNotificationChannel(channel)
    }

    fun channelState(): ChannelState {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return ChannelState(exists = true, importance = NotificationManager.IMPORTANCE_HIGH, blocked = false)
        }
        val channel = manager.getNotificationChannel(CHANNEL_ID)
            ?: return ChannelState(exists = false, importance = 0, blocked = false)
        return ChannelState(
            exists = true,
            importance = channel.importance,
            blocked = channel.importance == NotificationManager.IMPORTANCE_NONE,
        )
    }

    fun notificationsEnabled(): Boolean = manager.areNotificationsEnabled()

    fun isNotificationActive(requestCode: Int): Boolean =
        manager.activeNotifications.any { it.id == requestCode && it.tag == null }

    fun showReminder(reminder: StoredReminder): NotificationDelivery {
        ensureChannel()
        if (!notificationsEnabled()) return NotificationDelivery.PERMISSION_DENIED
        if (channelState().blocked) return NotificationDelivery.CHANNEL_BLOCKED
        return try {
            val notification =
                NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setColor(ContextCompat.getColor(context, R.color.notification_accent))
                    .setContentTitle(
                        reminder.title.ifBlank { context.getString(R.string.notification_default_title) },
                    )
                    .setContentText(reminder.body)
                    .setStyle(
                        NotificationCompat.BigTextStyle()
                            .bigText(reminder.body)
                            .setBigContentTitle(
                                reminder.title.ifBlank {
                                    context.getString(R.string.notification_default_title)
                                },
                            ),
                    )
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_REMINDER)
                    .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                    .setWhen(reminder.triggerAt)
                    .setShowWhen(true)
                    .setAutoCancel(true)
                    .setContentIntent(ReminderIntents.contentPendingIntent(context, reminder))
                    .addAction(
                        0,
                        context.getString(R.string.notification_action_complete),
                        ReminderIntents.completePendingIntent(context, reminder),
                    )
                    .addAction(
                        0,
                        context.getString(R.string.notification_action_snooze),
                        ReminderIntents.snoozePendingIntent(context, reminder),
                    )
                    .build()
            manager.notify(reminder.requestCode, notification)
            NotificationDelivery.POSTED
        } catch (_: SecurityException) {
            NotificationDelivery.PERMISSION_DENIED
        } catch (_: RuntimeException) {
            NotificationDelivery.ERROR
        }
    }

    fun cancel(reminder: StoredReminder) {
        manager.cancel(reminder.requestCode)
        ReminderIntents.cancelNotificationIntents(context, reminder)
    }
}
