package com.novatask.app.reminders

import java.time.DateTimeException
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/**
 * Floating wall-time arithmetic for native receivers.
 *
 * Policy (matches the TypeScript engine):
 * - A wall time inside a DST spring-forward gap moves forward by the gap
 *   (`02:30` becomes `03:30`), which is what [java.time] does by resolving with
 *   the offset in effect before the transition.
 * - A wall time inside a fall-back overlap resolves to the earlier offset, so
 *   the first occurrence is used.
 *
 * When [timezoneId] is null the device's current zone is used. Floating times
 * intentionally ignore the zone recorded at creation: a 09:00 task stays at
 * 09:00 after the user travels.
 */
internal object FloatingTime {
    fun toEpochMillis(localDate: String?, localTime: String?, timezoneId: String? = null): Long? {
        val date = localDate?.takeIf { it.isNotBlank() } ?: return null
        val time = localTime?.takeIf { it.isNotBlank() } ?: return null
        return try {
            val zone =
                if (timezoneId.isNullOrBlank()) ZoneId.systemDefault() else ZoneId.of(timezoneId)
            LocalDate.parse(date)
                .atTime(LocalTime.parse(time))
                .atZone(zone)
                .toInstant()
                .toEpochMilli()
        } catch (_: DateTimeException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }
}
