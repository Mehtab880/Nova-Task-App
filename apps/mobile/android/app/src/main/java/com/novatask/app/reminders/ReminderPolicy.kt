package com.novatask.app.reminders

/**
 * Pure scheduling rules shared by reconciliation, receivers, and unit tests.
 * Nothing in this object touches Android APIs.
 */
internal object ReminderPolicy {

  fun isValidRequestCode(requestCode: Int): Boolean = requestCode in 1..MAX_REQUEST_CODE

  /** Overdue alarms are fired almost immediately instead of being dropped. */
  fun effectiveTriggerAt(triggerAt: Long, now: Long): Long = maxOf(triggerAt, now + 1_000L)

  fun isOverdue(triggerAt: Long, now: Long): Boolean = triggerAt <= now

  /** Stable ordering: due first, then id for deterministic cap decisions. */
  fun sortForScheduling(reminders: List<StoredReminder>): List<StoredReminder> =
      reminders.sortedWith(compareBy<StoredReminder> { it.triggerAt }.thenBy { it.id })

  fun splitAtCap(
      reminders: List<StoredReminder>,
      cap: Int = MAX_PENDING_ALARMS,
  ): Pair<List<StoredReminder>, List<StoredReminder>> {
    val sorted = sortForScheduling(reminders)
    return sorted.take(cap) to sorted.drop(cap)
  }

  fun nextSnoozeAt(now: Long, minutes: Int = DEFAULT_SNOOZE_MINUTES): Long =
      now + minutes * 60_000L

  /** Alarm, content, complete, and snooze PendingIntents never share a code. */
  fun contentRequestCode(requestCode: Int): Int = requestCode + MAX_REQUEST_CODE

  fun completeActionRequestCode(requestCode: Int): Int = -requestCode

  fun snoozeActionRequestCode(requestCode: Int): Int = -(requestCode + MAX_REQUEST_CODE)

  fun scheduleState(overdue: Boolean, exact: Boolean): String {
    val base = if (exact) "exact" else "inexact"
    return if (overdue) "$base-overdue" else base
  }

  /**
   * PendingIntent tokens can outlive the one-shot alarm that used them, so the
   * cap and diagnostics must also require a state that still represents a
   * scheduled alarm.
   */
  fun hasPendingAlarm(scheduleMode: String): Boolean =
      scheduleMode == "exact" ||
          scheduleMode == "exact-overdue" ||
          scheduleMode == "inexact" ||
          scheduleMode == "inexact-overdue"

  fun actionId(type: String, reminderId: String, snoozedUntil: Long?): String =
      if (type == ACTION_SNOOZE) {
        "$type-$reminderId-$snoozedUntil"
      } else {
        "$type-$reminderId"
      }

  fun isTerminal(status: String): Boolean =
      status == STATUS_COMPLETED || status == STATUS_CANCELLED
}
