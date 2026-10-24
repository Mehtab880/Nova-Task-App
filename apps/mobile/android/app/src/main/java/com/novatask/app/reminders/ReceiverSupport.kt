package com.novatask.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

internal object ReceiverWork {
    val executor: ExecutorService = Executors.newSingleThreadExecutor()
}

internal fun reminderFromIntent(intent: Intent): StoredReminder? {
    val id = intent.getStringExtra(ReminderIntents.EXTRA_REMINDER_ID)?.takeIf { it.isNotBlank() } ?: return null
    val requestCode = intent.getIntExtra(ReminderIntents.EXTRA_REQUEST_CODE, 0)
    if (!ReminderPolicy.isValidRequestCode(requestCode)) return null
    return StoredReminder(
        id = id,
        requestCode = requestCode,
        title = intent.getStringExtra(ReminderIntents.EXTRA_TITLE).orEmpty(),
        body = intent.getStringExtra(ReminderIntents.EXTRA_BODY).orEmpty(),
        triggerAt = intent.getLongExtra("trigger_at", 0L),
        scheduleMode = "cache-miss",
        scheduleReason = "receiver-intent-fallback",
    )
}

/**
 * Shared receiver path for boot, package update, clock, time-zone, and exact
 * alarm permission changes. It restores alarms from the durable native cache.
 */
internal abstract class RescheduleReceiver(private val reason: String) : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        val pendingResult = goAsync()
        val appContext = context.applicationContext
        ReceiverWork.executor.execute {
            try {
                ReminderNotifier(appContext).ensureChannel()
                val outcome = ReminderScheduler(appContext).rescheduleFromStore(reason)
                Log.i(
                    "NovaReminders",
                    "Rescheduled from cache ($reason): scheduled=${outcome.scheduledCount} " +
                        "deferred=${outcome.deferredCount} errors=${outcome.errorCount}",
                )
            } catch (error: RuntimeException) {
                Log.e("NovaReminders", "Failed to reschedule from cache ($reason)", error)
            } finally {
                pendingResult.finish()
            }
        }
    }
}
