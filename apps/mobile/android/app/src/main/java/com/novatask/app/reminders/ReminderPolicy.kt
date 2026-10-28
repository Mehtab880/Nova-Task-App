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

  /**
   * A moved trigger only makes a visible notification stale when the new trigger
   * is still ahead. A trigger at or before [now] is the delivered reminder (for
   * example after a snooze fired), so its notification must stay in the shade.
   */
  fun shouldCancelStaleNotification(
      previousTriggerAt: Long,
      nextTriggerAt: Long,
      now: Long,
  ): Boolean = previousTriggerAt != nextTriggerAt && !isOverdue(nextTriggerAt, now)

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

  /** Alarm, content, complete, snooze, and dismiss PendingIntents never share a code. */
  fun contentRequestCode(requestCode: Int): Int = requestCode + MAX_REQUEST_CODE

  fun completeActionRequestCode(requestCode: Int): Int = -requestCode

  fun snoozeActionRequestCode(requestCode: Int): Int = -(requestCode + MAX_REQUEST_CODE)

  fun dismissActionRequestCode(requestCode: Int): Int = requestCode + 2 * MAX_REQUEST_CODE

  /**
   * A logical trigger is delivered when the posted attempt is at least the
   * current attempt. `triggerSeq` only advances on an explicit snooze, so a
   * recomputed trigger can never make a delivered row look pending again.
   */
  fun isDelivered(triggerSeq: Int, deliveredSeq: Int): Boolean =
      triggerSeq > 0 && deliveredSeq >= triggerSeq

  /** A fire callback for an attempt that was already posted (or superseded). */
  fun isDeliveryForCurrentAttempt(seq: Int, reminder: StoredReminder): Boolean =
      seq <= 0 || (seq == reminder.triggerSeq && !isDelivered(reminder.triggerSeq, reminder.deliveredSeq))

  /** Complete/snooze callbacks only apply to the attempt that is current now. */
  fun isActionForCurrentAttempt(seq: Int, reminder: StoredReminder): Boolean =
      seq <= 0 || seq == reminder.triggerSeq

  /** A dismissal is only valid for the delivered, not-yet-dismissed attempt. */
  fun isDismissalForDeliveredAttempt(seq: Int, reminder: StoredReminder): Boolean =
      seq > 0 &&
          seq == reminder.triggerSeq &&
          reminder.deliveredSeq >= seq &&
          reminder.dismissedSeq < seq

  /**
   * Cache replacement must never lose delivery/dismissal history, even when a
   * recomputed trigger or a stale JS snapshot arrives. Merge by id, take the
   * highest attempt numbers, and keep the newest timestamps.
   */
  fun mergeDeliveryState(incoming: StoredReminder, previous: StoredReminder?): StoredReminder {
    if (previous == null) return incoming
    return incoming.copy(
        triggerSeq = maxOf(incoming.triggerSeq, previous.triggerSeq),
        deliveredSeq = maxOf(incoming.deliveredSeq, previous.deliveredSeq),
        dismissedSeq = maxOf(incoming.dismissedSeq, previous.dismissedSeq),
        dismissedAt = newest(incoming.dismissedAt, previous.dismissedAt),
        lastFiredAt = newest(incoming.lastFiredAt, previous.lastFiredAt),
        deliveryState = incoming.deliveryState ?: previous.deliveryState,
    )
  }

  /**
   * When the cache holds a newer attempt than the incoming plan (for example a
   * snooze performed while the app was dead), the cache's trigger is the real
   * one. Otherwise the plan wins and a recomputed wall time is applied.
   */
  fun mergeForReconcile(incoming: StoredReminder, previous: StoredReminder?): StoredReminder {
    val merged = mergeDeliveryState(incoming, previous)
    if (previous == null || previous.triggerSeq <= incoming.triggerSeq) return merged
    return merged.copy(
        triggerAt = previous.triggerAt,
        localDate = previous.localDate,
        localTime = previous.localTime,
        scheduledAt = previous.scheduledAt,
    )
  }

  private fun newest(left: Long?, right: Long?): Long? =
      when {
        left == null -> right
        right == null -> left
        else -> maxOf(left, right)
      }

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
