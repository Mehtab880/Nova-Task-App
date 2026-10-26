package com.novatask.app.reminders

import android.app.AlarmManager
import android.content.Context
import android.os.Build
import android.util.Log

/**
 * Owns AlarmManager reconciliation. The 200-alarm cap applies to actual pending
 * alarms; overflow is persisted and reported so it can never be silently lost.
 */
internal class ReminderScheduler(
    context: Context,
    private val store: ReminderAlarmStore = ReminderAlarmStore(context),
) {

    private val appContext = context.applicationContext
    private val alarmManager = appContext.getSystemService(AlarmManager::class.java)
    private val notifier = ReminderNotifier(appContext)

    fun reconcile(
        reminders: List<StoredReminder>,
        reason: String,
        fromCache: Boolean = false,
    ): ReconcileOutcome {
        val now = System.currentTimeMillis()
        notifier.ensureChannel()

        val previous = store.snapshot().reminders.associateBy { it.id }
        val active =
            reminders.filter { it.status == STATUS_SCHEDULED && !ReminderPolicy.isTerminal(it.status) }

        val seenIds = mutableSetOf<String>()
        val seenCodes = mutableSetOf<Int>()
        val outcomes = mutableListOf<ScheduleOutcome>()
        val nextStore = mutableListOf<StoredReminder>()
        var scheduledCount = 0
        var exactCount = 0
        var inexactCount = 0
        var deferredCount = 0
        var errorCount = 0

        for (reminder in ReminderPolicy.sortForScheduling(active)) {
            val duplicateId = !seenIds.add(reminder.id)
            val duplicateCode = !seenCodes.add(reminder.requestCode)
            if (!ReminderPolicy.isValidRequestCode(reminder.requestCode) || duplicateId || duplicateCode) {
                val reasonText =
                    when {
                        !ReminderPolicy.isValidRequestCode(reminder.requestCode) ->
                            "invalid-request-code"
                        duplicateId -> "duplicate-reminder-id"
                        else -> "duplicate-request-code"
                    }
                errorCount += 1
                outcomes.add(
                    ScheduleOutcome(
                        id = reminder.id,
                        requestCode = reminder.requestCode,
                        state = "error",
                        reason = reasonText,
                        scheduledFor = null,
                        notificationActive = false,
                    ),
                )
                nextStore.add(
                    reminder.copy(
                        scheduleMode = "error",
                        scheduleReason = reasonText,
                        scheduledAt = null,
                        updatedAt = now,
                    ),
                )
                continue
            }

            val overdue = ReminderPolicy.isOverdue(reminder.triggerAt, now)
            val notificationActive = notifier.isNotificationActive(reminder.requestCode)

            when {
                notificationActive && overdue -> {
                    ReminderIntents.cancelAlarm(appContext, reminder.id, reminder.requestCode)
                    outcomes.add(
                        ScheduleOutcome(
                            id = reminder.id,
                            requestCode = reminder.requestCode,
                            state = "delivered-active",
                            reason = "notification-visible",
                            scheduledFor = null,
                            notificationActive = true,
                        ),
                    )
                    nextStore.add(
                        reminder.copy(
                            scheduleMode = "delivered-active",
                            scheduleReason = "notification-visible",
                            scheduledAt = null,
                            updatedAt = now,
                        ),
                    )
                }

                overdue && !notifier.notificationsEnabled() -> {
                    ReminderIntents.cancelAlarm(appContext, reminder.id, reminder.requestCode)
                    outcomes.add(
                        ScheduleOutcome(
                            id = reminder.id,
                            requestCode = reminder.requestCode,
                            state = "blocked-notification-permission",
                            reason = "notifications-disabled",
                            scheduledFor = null,
                            notificationActive = false,
                        ),
                    )
                    nextStore.add(
                        reminder.copy(
                            scheduleMode = "blocked-notification-permission",
                            scheduleReason = "notifications-disabled",
                            scheduledAt = null,
                            updatedAt = now,
                        ),
                    )
                }

                scheduledCount >= MAX_PENDING_ALARMS -> {
                    ReminderIntents.cancelAlarm(appContext, reminder.id, reminder.requestCode)
                    if (notificationActive) notifier.cancel(reminder)
                    deferredCount += 1
                    outcomes.add(
                        ScheduleOutcome(
                            id = reminder.id,
                            requestCode = reminder.requestCode,
                            state = "deferred-cap",
                            reason = "pending-alarm-cap",
                            scheduledFor = null,
                            notificationActive = false,
                        ),
                    )
                    nextStore.add(
                        reminder.copy(
                            scheduleMode = "deferred-cap",
                            scheduleReason = "pending-alarm-cap",
                            scheduledAt = null,
                            updatedAt = now,
                        ),
                    )
                }

                else -> {
                    // A visible notification for a future trigger is stale (for
                    // example the user snoozed from the app). Replace it with a
                    // fresh alarm instead of marking the reminder delivered.
                    if (notificationActive) notifier.cancel(reminder)
                    val scheduledFor = ReminderPolicy.effectiveTriggerAt(reminder.triggerAt, now)
                    val exactAllowed = canScheduleExact()
                    var exact = exactAllowed
                    var scheduled = true

                    try {
                        setAlarm(reminder, scheduledFor, exactAllowed)
                    } catch (_: SecurityException) {
                        // The permission can be revoked between the check and the call.
                        if (exactAllowed) {
                            exact = false
                            scheduled =
                                runCatching { setAlarm(reminder, scheduledFor, exact = false) }
                                    .onFailure { error ->
                                        Log.e(TAG, "Failed to schedule reminder ${reminder.id}", error)
                                    }
                                    .isSuccess
                        } else {
                            scheduled = false
                        }
                    } catch (error: RuntimeException) {
                        Log.e(TAG, "Failed to schedule reminder ${reminder.id}", error)
                        scheduled = false
                    }

                    if (!scheduled) {
                        errorCount += 1
                        outcomes.add(
                            ScheduleOutcome(
                                id = reminder.id,
                                requestCode = reminder.requestCode,
                                state = "error",
                                reason = "alarm-scheduling-failed",
                                scheduledFor = null,
                                notificationActive = false,
                            ),
                        )
                        nextStore.add(
                            reminder.copy(
                                scheduleMode = "error",
                                scheduleReason = "alarm-scheduling-failed",
                                scheduledAt = null,
                                updatedAt = now,
                            ),
                        )
                    } else {
                        val mode = ReminderPolicy.scheduleState(overdue, exact)
                        scheduledCount += 1
                        if (exact) exactCount += 1 else inexactCount += 1
                        outcomes.add(
                            ScheduleOutcome(
                                id = reminder.id,
                                requestCode = reminder.requestCode,
                                state = mode,
                                reason = if (overdue) "overdue-fired-immediately" else null,
                                scheduledFor = scheduledFor,
                                notificationActive = false,
                            ),
                        )
                        nextStore.add(
                            reminder.copy(
                                scheduleMode = mode,
                                scheduleReason = if (overdue) "overdue-fired-immediately" else null,
                                scheduledAt = scheduledFor,
                                updatedAt = now,
                            ),
                        )
                    }
                }
            }
        }

        val activeIds = active.map { it.id }.toSet()
        val activeById = active.associateBy { it.id }
        // Request codes are reused only after a row is deleted, so an old alarm
        // may share a code with a newly created reminder. Never cancel a code
        // that is still in use by an active reminder.
        val activeCodes = active.map { it.requestCode }.toSet()
        previous.values
            .filter { it.id !in activeIds && it.requestCode !in activeCodes }
            .forEach { old ->
                ReminderIntents.cancelAlarm(appContext, old.id, old.requestCode)
                notifier.cancel(old)
            }
        previous.values
            .filter { old ->
                val current = activeById[old.id]
                current != null &&
                    current.requestCode != old.requestCode &&
                    old.requestCode !in activeCodes
            }
            .forEach { old ->
                ReminderIntents.cancelAlarm(appContext, old.id, old.requestCode)
                notifier.cancel(old)
            }
        previous.values
            .filter { old ->
                val current = activeById[old.id]
                current != null &&
                    current.requestCode == old.requestCode &&
                    current.triggerAt != old.triggerAt
            }
            .forEach { old -> notifier.cancel(old) }

        store.replaceAll(nextStore, now, reason, fromCache)

        return ReconcileOutcome(
            reconciledAt = now,
            cap = MAX_PENDING_ALARMS,
            scheduledCount = scheduledCount,
            exactCount = exactCount,
            inexactCount = inexactCount,
            deferredCount = deferredCount,
            errorCount = errorCount,
            results = outcomes,
        )
    }

    fun rescheduleFromStore(reason: String): ReconcileOutcome {
        val reminders =
            store.snapshot().reminders
                .filter { it.status == STATUS_SCHEDULED }
                // Rebuild floating wall times in the current device zone so a
                // time-zone change cannot leave stale absolute instants behind.
                .map { it.withRecomputedTrigger() }
        return reconcile(reminders, reason, fromCache = true)
    }

    fun scheduleSingle(reminder: StoredReminder): ScheduleOutcome {
        val now = System.currentTimeMillis()
        val otherAlarms =
            store.snapshot().reminders.count {
                it.id != reminder.id &&
                    it.status == STATUS_SCHEDULED &&
                    ReminderPolicy.hasPendingAlarm(it.scheduleMode) &&
                    pendingIntentExists(it)
            }
        if (otherAlarms >= MAX_PENDING_ALARMS) {
            return ScheduleOutcome(
                id = reminder.id,
                requestCode = reminder.requestCode,
                state = "deferred-cap",
                reason = "pending-alarm-cap",
                scheduledFor = null,
                notificationActive = false,
            )
        }
        val overdue = ReminderPolicy.isOverdue(reminder.triggerAt, now)
        val scheduledFor = ReminderPolicy.effectiveTriggerAt(reminder.triggerAt, now)
        var exact = canScheduleExact()
        var scheduled = true
        try {
            setAlarm(reminder, scheduledFor, exact)
        } catch (_: SecurityException) {
            if (exact) {
                exact = false
                scheduled =
                    runCatching { setAlarm(reminder, scheduledFor, exact = false) }
                        .onFailure { error ->
                            Log.e(TAG, "Failed to schedule single reminder ${reminder.id}", error)
                        }
                        .isSuccess
            } else {
                scheduled = false
            }
        } catch (error: RuntimeException) {
            Log.e(TAG, "Failed to schedule single reminder ${reminder.id}", error)
            scheduled = false
        }

        if (!scheduled) {
            return ScheduleOutcome(
                id = reminder.id,
                requestCode = reminder.requestCode,
                state = "error",
                reason = "alarm-scheduling-failed",
                scheduledFor = null,
                notificationActive = false,
            )
        }

        return ScheduleOutcome(
            id = reminder.id,
            requestCode = reminder.requestCode,
            state = ReminderPolicy.scheduleState(overdue, exact),
            reason = if (overdue) "overdue-fired-immediately" else null,
            scheduledFor = scheduledFor,
            notificationActive = false,
        )
    }

    fun canScheduleExact(): Boolean =
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            true
        } else {
            runCatching { alarmManager.canScheduleExactAlarms() }.getOrDefault(false)
        }

    fun isPowerSaveMode(): Boolean =
        appContext.getSystemService(android.os.PowerManager::class.java).isPowerSaveMode

    fun isDeviceIdleMode(): Boolean =
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            false
        } else {
            appContext.getSystemService(android.os.PowerManager::class.java).isDeviceIdleMode
        }

    fun isIgnoringBatteryOptimizations(): Boolean {
        val power = appContext.getSystemService(android.os.PowerManager::class.java)
        return power.isIgnoringBatteryOptimizations(appContext.packageName)
    }

    fun pendingIntentExists(reminder: StoredReminder): Boolean =
        ReminderIntents.alarmExists(appContext, reminder.id, reminder.requestCode)

    private fun setAlarm(reminder: StoredReminder, triggerAt: Long, exact: Boolean) {
        val pendingIntent = ReminderIntents.alarmPendingIntent(appContext, reminder)
        if (exact) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAt,
                pendingIntent,
            )
        } else {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        }
    }

    private companion object {
        const val TAG = "NovaReminders"
    }
}
