package com.novatask.app.reminders

import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

/**
 * Floating wall-time policy shared with the TypeScript recurrence engine.
 *
 * The vectors mirror `apps/mobile/src/recurrence/time.test.ts`:
 * - spring-forward gaps shift forward by the size of the gap
 * - fall-back overlaps resolve to the earlier offset
 * - the recorded time zone is diagnostics only; the current zone wins
 */
class FloatingTimeTest {

  private fun millis(iso: String): Long = Instant.parse(iso).toEpochMilli()

  @Test
  fun `wall time in a spring forward gap shifts forward`() {
    // 2024-03-10 02:30 does not exist in New York; it becomes 03:30 EDT.
    val result = FloatingTime.toEpochMillis("2024-03-10", "02:30", "America/New_York")

    assertEquals(millis("2024-03-10T07:30:00Z"), result)
  }

  @Test
  fun `ambiguous fall back time uses the earlier offset`() {
    // 2024-11-03 01:30 happens twice in New York; the first is EDT (UTC-4).
    val result = FloatingTime.toEpochMillis("2024-11-03", "01:30", "America/New_York")

    assertEquals(millis("2024-11-03T05:30:00Z"), result)
  }

  @Test
  fun `same wall time resolves differently per zone`() {
    val newYork = FloatingTime.toEpochMillis("2024-06-01", "09:00", "America/New_York")
    val tokyo = FloatingTime.toEpochMillis("2024-06-01", "09:00", "Asia/Tokyo")

    assertEquals(millis("2024-06-01T13:00:00Z"), newYork)
    assertEquals(millis("2024-06-01T00:00:00Z"), tokyo)
  }

  @Test
  fun `missing or malformed values return null`() {
    assertNull(FloatingTime.toEpochMillis(null, "09:00", "UTC"))
    assertNull(FloatingTime.toEpochMillis("2024-06-01", null, "UTC"))
    assertNull(FloatingTime.toEpochMillis("", "09:00", "UTC"))
    assertNull(FloatingTime.toEpochMillis("not-a-date", "09:00", "UTC"))
    assertNull(FloatingTime.toEpochMillis("2024-06-01", "25:00", "UTC"))
    assertNull(FloatingTime.toEpochMillis("2024-06-01", "09:00", "Not/AZone"))
  }

  @Test
  fun `echoing the stored zone keeps the same instant`() {
    val instant = FloatingTime.toEpochMillis("2024-06-01", "09:00", "Europe/Berlin")
    val again = FloatingTime.toEpochMillis("2024-06-01", "09:00", "Europe/Berlin")

    assertEquals(instant, again)
    assertEquals(millis("2024-06-01T07:00:00Z"), instant)
  }

  @Test
  fun `recomputed trigger follows the floating wall time in the current zone`() {
    val reminder =
        StoredReminder(
            id = "reminder-1",
            requestCode = 42,
            title = "Stand up",
            body = "",
            triggerAt = millis("2024-06-01T07:00:00Z"),
            localDate = "2024-06-01",
            localTime = "09:00",
            timezone = "Europe/Berlin",
        )

    // The user travelled to New York: 09:00 local is now 13:00 UTC.
    val moved = reminder.withRecomputedTrigger("America/New_York")

    assertEquals(millis("2024-06-01T13:00:00Z"), moved.triggerAt)
    assertEquals("2024-06-01", moved.localDate)
    assertEquals("09:00", moved.localTime)
    assertEquals("Europe/Berlin", moved.timezone)
    assertEquals(reminder.id, moved.id)
    assertEquals(reminder.requestCode, moved.requestCode)
  }

  @Test
  fun `recompute keeps the reminder when the wall time is unchanged`() {
    val reminder =
        StoredReminder(
            id = "reminder-2",
            requestCode = 43,
            title = "Stand up",
            body = "",
            triggerAt = millis("2024-06-01T07:00:00Z"),
            localDate = "2024-06-01",
            localTime = "09:00",
            timezone = "Europe/Berlin",
        )

    val same = reminder.withRecomputedTrigger("Europe/Berlin")

    assertEquals(reminder.triggerAt, same.triggerAt)
  }

  @Test
  fun `absolute reminders without floating fields are returned untouched`() {
    val reminder =
        StoredReminder(
            id = "reminder-3",
            requestCode = 44,
            title = "Snoozed",
            body = "",
            triggerAt = millis("2024-06-01T07:00:00Z"),
        )

    assertSame(reminder, reminder.withRecomputedTrigger("America/New_York"))
  }

  @Test
  fun `current zone is used when no zone is supplied`() {
    val result = FloatingTime.toEpochMillis("2024-06-01", "09:00")

    // The default zone is whatever the test JVM runs in; the important part is
    // that the value round-trips through the same zone.
    val expected =
        java.time.LocalDate.parse("2024-06-01")
            .atTime(java.time.LocalTime.parse("09:00"))
            .atZone(ZoneId.systemDefault())
            .toInstant()
            .toEpochMilli()
    assertEquals(expected, result)
  }
}
