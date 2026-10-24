package com.novatask.app.reminders

import android.content.Context
import org.json.JSONArray

/**
 * Durable SharedPreferences cache of scheduled reminders. It is intentionally a
 * cache: SQLite owns reminder truth, but receivers must work when React Native
 * is not running. Writes use commit() so a receiver can finish safely.
 */
internal class ReminderAlarmStore(context: Context) {

    private val prefs =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun snapshot(): StoreSnapshot =
        synchronized(LOCK) {
            StoreSnapshot(
                reminders = readAllLocked(),
                lastReconciledAt = prefs.nullableLong(KEY_LAST_RECONCILED_AT),
                lastReconcileReason = prefs.getString(KEY_LAST_RECONCILE_REASON, null),
                lastRescheduleAt = prefs.nullableLong(KEY_LAST_RESCHEDULE_AT),
                lastRescheduleReason = prefs.getString(KEY_LAST_RESCHEDULE_REASON, null),
            )
        }

    fun find(id: String): StoredReminder? =
        synchronized(LOCK) { readAllLocked().firstOrNull { it.id == id } }

    fun replaceAll(
        reminders: List<StoredReminder>,
        reconciledAt: Long,
        reason: String,
        fromCache: Boolean = false,
    ) {
        synchronized(LOCK) {
            val previous = readAllLocked().associateBy { it.id }
            val merged =
                reminders.map { incoming ->
                    val old = previous[incoming.id]
                    if (old != null && old.triggerAt == incoming.triggerAt) {
                        incoming.copy(
                            lastFiredAt = old.lastFiredAt,
                            deliveryState = old.deliveryState,
                        )
                    } else {
                        incoming
                    }
                }
            prefs
                .edit()
                .putString(KEY_ALARMS, encode(merged))
                .putLong(KEY_LAST_RECONCILED_AT, reconciledAt)
                .putString(KEY_LAST_RECONCILE_REASON, reason)
                .apply {
                    if (fromCache) {
                        putLong(KEY_LAST_RESCHEDULE_AT, reconciledAt)
                        putString(KEY_LAST_RESCHEDULE_REASON, reason)
                    }
                }
                .commit()
        }
    }

    fun upsert(reminder: StoredReminder): Boolean =
        synchronized(LOCK) {
            val reminders = readAllLocked().toMutableList()
            val index = reminders.indexOfFirst { it.id == reminder.id }
            if (index >= 0) {
                reminders[index] = reminder
            } else {
                reminders.add(reminder)
            }
            writeAllLocked(reminders)
        }

    fun update(id: String, transform: (StoredReminder) -> StoredReminder): StoredReminder? =
        synchronized(LOCK) {
            val reminders = readAllLocked().toMutableList()
            val index = reminders.indexOfFirst { it.id == id }
            if (index < 0) return@synchronized null
            val updated = transform(reminders[index])
            reminders[index] = updated
            if (!writeAllLocked(reminders)) return@synchronized null
            updated
        }

    fun remove(id: String): Boolean =
        synchronized(LOCK) {
            val reminders = readAllLocked().toMutableList()
            val removed = reminders.removeAll { it.id == id }
            removed && writeAllLocked(reminders)
        }

    fun recordNotificationRequested() {
        synchronized(LOCK) {
            prefs.edit().putBoolean(KEY_NOTIFICATION_REQUESTED, true).commit()
        }
    }

    fun notificationRequested(): Boolean =
        synchronized(LOCK) { prefs.getBoolean(KEY_NOTIFICATION_REQUESTED, false) }

    private fun readAllLocked(): List<StoredReminder> =
        parseReminders(prefs.getString(KEY_ALARMS, null))

    private fun writeAllLocked(reminders: List<StoredReminder>): Boolean =
        prefs.edit().putString(KEY_ALARMS, encode(reminders)).commit()

    private fun encode(reminders: List<StoredReminder>): String =
        JSONArray().apply {
            reminders.forEach { put(it.toJson()) }
        }.toString()

    private fun android.content.SharedPreferences.nullableLong(key: String): Long? =
        if (contains(key)) getLong(key, 0L) else null

    private companion object {
        val LOCK = Any()
    }
}
