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
    }
    assertEquals(codes.size * 4, all.size)
    assertFalse(ReminderPolicy.isValidRequestCode(0))
    assertFalse(ReminderPolicy.isValidRequestCode(MAX_REQUEST_CODE + 1))
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
