package com.novatask.app.reminders

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.novatask.app.MainActivity

/** Creates immutable, uniquely-coded PendingIntents for alarms and actions. */
internal object ReminderIntents {

    const val ACTION_FIRE = "com.novatask.app.reminders.FIRE"
    const val ACTION_COMPLETE = "com.novatask.app.reminders.COMPLETE"
    const val ACTION_SNOOZE = "com.novatask.app.reminders.SNOOZE"

    const val EXTRA_REMINDER_ID = "reminder_id"
    const val EXTRA_REQUEST_CODE = "request_code"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_SNOOZE_MINUTES = "snooze_minutes"

    private const val BASE_FLAGS = PendingIntent.FLAG_IMMUTABLE

    fun alarmPendingIntent(
        context: Context,
        reminder: StoredReminder,
        updateCurrent: Boolean = true,
    ): PendingIntent {
        val flags =
            if (updateCurrent) BASE_FLAGS or PendingIntent.FLAG_UPDATE_CURRENT else BASE_FLAGS
        return PendingIntent.getBroadcast(
            context,
            reminder.requestCode,
            alarmIntent(context, reminder),
            flags,
        )
    }

    fun cancelAlarm(context: Context, reminderId: String, requestCode: Int) {
        val pending =
            PendingIntent.getBroadcast(
                context,
                requestCode,
                alarmIntent(context, reminderId, requestCode, "", "", 0L),
                BASE_FLAGS or PendingIntent.FLAG_NO_CREATE,
            )
        pending?.cancel()
    }

    fun alarmExists(context: Context, reminderId: String, requestCode: Int): Boolean =
        PendingIntent.getBroadcast(
            context,
            requestCode,
            alarmIntent(context, reminderId, requestCode, "", "", 0L),
            BASE_FLAGS or PendingIntent.FLAG_NO_CREATE,
        ) != null

    fun completePendingIntent(context: Context, reminder: StoredReminder): PendingIntent =
        actionPendingIntent(context, reminder, ACTION_COMPLETE)

    fun snoozePendingIntent(context: Context, reminder: StoredReminder): PendingIntent =
        actionPendingIntent(context, reminder, ACTION_SNOOZE)

    fun contentPendingIntent(context: Context, reminder: StoredReminder): PendingIntent =
        PendingIntent.getActivity(
            context,
            ReminderPolicy.contentRequestCode(reminder.requestCode),
            contentIntent(context, reminder),
            BASE_FLAGS or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    fun cancelNotificationIntents(context: Context, reminder: StoredReminder) {
        listOf(
                ACTION_COMPLETE to ReminderPolicy.completeActionRequestCode(reminder.requestCode),
                ACTION_SNOOZE to ReminderPolicy.snoozeActionRequestCode(reminder.requestCode),
            )
            .forEach { (action, requestCode) ->
                PendingIntent.getBroadcast(
                        context,
                        requestCode,
                        actionIntent(context, reminder.id, reminder.requestCode, action),
                        BASE_FLAGS or PendingIntent.FLAG_NO_CREATE,
                    )
                    ?.cancel()
            }
        PendingIntent.getActivity(
                context,
                ReminderPolicy.contentRequestCode(reminder.requestCode),
                contentIntent(context, reminder),
                BASE_FLAGS or PendingIntent.FLAG_NO_CREATE,
            )
            ?.cancel()
    }

    private fun actionPendingIntent(
        context: Context,
        reminder: StoredReminder,
        action: String,
    ): PendingIntent {
        val requestCode =
            if (action == ACTION_COMPLETE) {
                ReminderPolicy.completeActionRequestCode(reminder.requestCode)
            } else {
                ReminderPolicy.snoozeActionRequestCode(reminder.requestCode)
            }
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            actionIntent(context, reminder.id, reminder.requestCode, action).apply {
                putExtra(EXTRA_TITLE, reminder.title)
                putExtra(EXTRA_BODY, reminder.body)
                putExtra(EXTRA_SNOOZE_MINUTES, DEFAULT_SNOOZE_MINUTES)
            },
            BASE_FLAGS or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private fun alarmIntent(context: Context, reminder: StoredReminder): Intent =
        alarmIntent(
            context,
            reminder.id,
            reminder.requestCode,
            reminder.title,
            reminder.body,
            reminder.triggerAt,
        )

    private fun alarmIntent(
        context: Context,
        reminderId: String,
        requestCode: Int,
        title: String,
        body: String,
        triggerAt: Long,
    ): Intent =
        Intent(context, ReminderAlarmReceiver::class.java).apply {
            action = ACTION_FIRE
            data = Uri.parse("novatask://reminder/$reminderId")
            putExtra(EXTRA_REMINDER_ID, reminderId)
            putExtra(EXTRA_REQUEST_CODE, requestCode)
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_BODY, body)
            putExtra("trigger_at", triggerAt)
        }

    private fun contentIntent(context: Context, reminder: StoredReminder): Intent =
        Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("novatask://reminder/${reminder.id}")
            putExtra(EXTRA_REMINDER_ID, reminder.id)
            putExtra(EXTRA_REQUEST_CODE, reminder.requestCode)
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }

    private fun actionIntent(
        context: Context,
        reminderId: String,
        requestCode: Int,
        action: String,
    ): Intent =
        Intent(context, ReminderActionReceiver::class.java).apply {
            this.action = action
            data = Uri.parse("novatask://reminder/$reminderId/$action")
            putExtra(EXTRA_REMINDER_ID, reminderId)
            putExtra(EXTRA_REQUEST_CODE, requestCode)
        }
}
