package com.novatask.app.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderPolicyTest {

  private fun reminder(id: String, triggerAt: Long = 1_000L, code: Int = 1): StoredReminder =
      StoredReminder(
          id = id,
          requestCode = code,
          title = id,
          body = "",
          triggerAt = triggerAt,
      )

  @Test
  fun `cap keeps the earliest two hundred and reports the rest`() {
    val reminders =
        (1..205).map { index ->
          reminder(id = "r$index", triggerAt = 10_000L + index, code = index)
        }

    val (kept, overflow) = ReminderPolicy.splitAtCap(reminders.shuffled())

    assertEquals(200, kept.size)
    assertEquals(5, overflow.size)
    assertEquals("r1", kept.first().id)
    assertEquals("r201", overflow.first().id)
  }

  @Test
  fun `overdue reminders are moved just ahead instead of dropped`() {
    val now = 50_000L
    assertEquals(now + 1_000L, ReminderPolicy.effectiveTriggerAt(10_000L, now))
    assertEquals(60_000L, ReminderPolicy.effectiveTriggerAt(60_000L, now))
    assertTrue(ReminderPolicy.isOverdue(49_999L, now))
    assertFalse(ReminderPolicy.isOverdue(50_001L, now))
  }

  @Test
  fun `request code namespaces never collide`() {
    val codes = listOf(1, 2, MAX_REQUEST_CODE / 2, MAX_REQUEST_CODE)
    val all = mutableSetOf<Int>()
    for (code in codes) {
      assertTrue(ReminderPolicy.isValidRequestCode(code))
      assertTrue(all.add(code))
      assertTrue(all.add(ReminderPolicy.contentRequestCode(code)))
      assertTrue(all.add(ReminderPolicy.completeActionRequestCode(code)))
      assertTrue(all.add(ReminderPolicy.snoozeActionRequestCode(code)))
      assertTrue(all.add(ReminderPolicy.dismissActionRequestCode(code)))
    }
    assertEquals(codes.size * 5, all.size)
    assertFalse(ReminderPolicy.isValidRequestCode(0))
    assertFalse(ReminderPolicy.isValidRequestCode(MAX_REQUEST_CODE + 1))
  }

  @Test
  fun `delivered trigger is identified by attempt sequence`() {
    assertFalse(ReminderPolicy.isDelivered(1, 0))
    assertTrue(ReminderPolicy.isDelivered(1, 1))
    assertTrue(ReminderPolicy.isDelivered(1, 2))
    // A snooze starts attempt 2, which is pending again.
    assertFalse(ReminderPolicy.isDelivered(2, 1))
    assertTrue(ReminderPolicy.isDelivered(2, 2))
    assertFalse(ReminderPolicy.isDelivered(0, 5))
  }

  @Test
  fun `delivery and dismissal callbacks are validated against the attempt`() {
    val delivered = reminder("r1").copy(triggerSeq = 1, deliveredSeq = 1)
    assertFalse(ReminderPolicy.isDeliveryForCurrentAttempt(1, delivered))
    assertTrue(ReminderPolicy.isActionForCurrentAttempt(1, delivered))
    assertTrue(ReminderPolicy.isDismissalForDeliveredAttempt(1, delivered))
    assertFalse(
        ReminderPolicy.isDismissalForDeliveredAttempt(1, delivered.copy(dismissedSeq = 1)),
    )

    val snoozed = delivered.copy(triggerSeq = 2)
    assertTrue(ReminderPolicy.isDeliveryForCurrentAttempt(2, snoozed))
    assertFalse(ReminderPolicy.isDeliveryForCurrentAttempt(1, snoozed))
    assertFalse(ReminderPolicy.isDismissalForDeliveredAttempt(1, snoozed))
    assertFalse(ReminderPolicy.isDismissalForDeliveredAttempt(2, snoozed))

    assertFalse(ReminderPolicy.isDismissalForDeliveredAttempt(1, reminder("r1")))
  }

  @Test
  fun `cache replacement keeps delivery and dismissal history`() {
    val previous =
        reminder("r1", triggerAt = 1_000L, code = 7)
            .copy(
                triggerSeq = 2,
                deliveredSeq = 2,
                dismissedSeq = 2,
                dismissedAt = 2_000L,
                lastFiredAt = 1_500L,
                deliveryState = "posted",
            )
    val staleIncoming = reminder("r1", triggerAt = 9_999L, code = 7)
    val merged = ReminderPolicy.mergeDeliveryState(staleIncoming, previous)

    assertEquals(2, merged.triggerSeq)
    assertEquals(2, merged.deliveredSeq)
    assertEquals(2, merged.dismissedSeq)
    assertEquals(2_000L, merged.dismissedAt)
    assertEquals(1_500L, merged.lastFiredAt)
    assertEquals("posted", merged.deliveryState)
    // A recomputed trigger still applies; only history is preserved.
    assertEquals(9_999L, merged.triggerAt)

    val bumped = ReminderPolicy.mergeDeliveryState(previous.copy(triggerSeq = 3), previous)
    assertEquals(3, bumped.triggerSeq)
    assertEquals(2, bumped.deliveredSeq)
    assertFalse(ReminderPolicy.isDelivered(bumped.triggerSeq, bumped.deliveredSeq))
  }

  @Test
  fun `a newer cached attempt keeps its snoozed trigger`() {
    val plan = reminder("r1", triggerAt = 1_000L, code = 7)
    val cached =
        reminder("r1", triggerAt = 500_000L, code = 7)
            .copy(triggerSeq = 2, deliveredSeq = 1, localDate = null, localTime = null)

    val merged = ReminderPolicy.mergeForReconcile(plan, cached)

    assertEquals(500_000L, merged.triggerAt)
    assertEquals(2, merged.triggerSeq)
    assertEquals(1, merged.deliveredSeq)
    assertFalse(ReminderPolicy.isDelivered(merged.triggerSeq, merged.deliveredSeq))
  }

  @Test
  fun `a recomputed plan trigger wins when the attempt is unchanged`() {
    val plan =
        reminder("r1", triggerAt = 2_000L, code = 7)
            .copy(localDate = "2026-03-02", localTime = "07:00")
    val cached = reminder("r1", triggerAt = 1_000L, code = 7).copy(deliveredSeq = 1)

    val merged = ReminderPolicy.mergeForReconcile(plan, cached)

    assertEquals(2_000L, merged.triggerAt)
    assertEquals(1, merged.deliveredSeq)
    assertTrue(ReminderPolicy.isDelivered(merged.triggerSeq, merged.deliveredSeq))
  }

  @Test
  fun `delivery state survives json round trip`() {
    val original =
        reminder("r1")
            .copy(
                triggerSeq = 3,
                deliveredSeq = 2,
                dismissedSeq = 1,
                dismissedAt = 42L,
                lastFiredAt = 41L,
            )
    assertEquals(original, StoredReminder.fromJson(original.toJson()))
  }

  @Test
  fun `snooze is ten minutes and action ids are deterministic`() {
    assertEquals(601_000L, ReminderPolicy.nextSnoozeAt(1_000L))
    assertEquals(
        "complete-r1",
        ReminderPolicy.actionId(ACTION_COMPLETE, "r1", null),
    )
    assertEquals(
        "snooze-r1-601000",
        ReminderPolicy.actionId(ACTION_SNOOZE, "r1", 601_000L),
    )
  }

  @Test
  fun `schedule state distinguishes exact and inexact overdue alarms`() {
    assertEquals("exact", ReminderPolicy.scheduleState(overdue = false, exact = true))
    assertEquals("inexact", ReminderPolicy.scheduleState(overdue = false, exact = false))
    assertEquals("exact-overdue", ReminderPolicy.scheduleState(overdue = true, exact = true))
    assertEquals("inexact-overdue", ReminderPolicy.scheduleState(overdue = true, exact = false))
  }

  @Test
  fun `a delivered trigger is not treated as a stale notification`() {
    val now = 1_000_000L
    // Case 13: the snooze fired at 14:07:49 and the next plan sends the
    // original wall time, which is already in the past.
    assertFalse(ReminderPolicy.shouldCancelStaleNotification(now, now - 600_000L, now))
    // A pending reminder that moves to another future time is stale.
    assertTrue(ReminderPolicy.shouldCancelStaleNotification(now, now + 60_000L, now))
    // An unchanged trigger never cancels.
    assertFalse(ReminderPolicy.shouldCancelStaleNotification(now, now, now))
  }

  @Test
  fun `terminal statuses cannot be rescheduled`() {
    assertTrue(ReminderPolicy.isTerminal(STATUS_COMPLETED))
    assertTrue(ReminderPolicy.isTerminal(STATUS_CANCELLED))
    assertFalse(ReminderPolicy.isTerminal(STATUS_SCHEDULED))
  }

  @Test
  fun `only scheduled alarm states count toward the pending cap`() {
    assertTrue(ReminderPolicy.hasPendingAlarm("exact"))
    assertTrue(ReminderPolicy.hasPendingAlarm("exact-overdue"))
    assertTrue(ReminderPolicy.hasPendingAlarm("inexact"))
    assertTrue(ReminderPolicy.hasPendingAlarm("inexact-overdue"))
    assertFalse(ReminderPolicy.hasPendingAlarm("fired"))
    assertFalse(ReminderPolicy.hasPendingAlarm("deferred-cap"))
    assertFalse(ReminderPolicy.hasPendingAlarm("blocked-notification-permission"))
    assertFalse(ReminderPolicy.hasPendingAlarm("delivered-active"))
    assertFalse(ReminderPolicy.hasPendingAlarm("error"))
  }
}
