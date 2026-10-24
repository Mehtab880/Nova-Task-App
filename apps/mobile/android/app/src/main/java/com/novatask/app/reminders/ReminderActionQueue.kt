package com.novatask.app.reminders

import android.content.Context
import org.json.JSONArray

/**
 * Durable queue of user actions that happened outside JS. SQLite is updated when
 * the app next runs; actions are acknowledged only after the database commit.
 */
internal class ReminderActionQueue(context: Context) {

    private val prefs =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun enqueue(action: NativeAction): Boolean =
        synchronized(LOCK) {
            val actions = readLocked().toMutableList()
            if (actions.any { it.actionId == action.actionId }) {
                return@synchronized true
            }
            actions.add(action)
            writeLocked(actions)
        }

    fun pending(): List<NativeAction> = synchronized(LOCK) { readLocked() }

    fun acknowledge(actionIds: Set<String>): Int =
        synchronized(LOCK) {
            if (actionIds.isEmpty()) return@synchronized 0
            val actions = readLocked().toMutableList()
            val before = actions.size
            actions.removeAll { it.actionId in actionIds }
            if (!writeLocked(actions)) return@synchronized 0
            before - actions.size
        }

    private fun readLocked(): List<NativeAction> =
        parseActions(prefs.getString(KEY_ACTIONS, null))

    private fun writeLocked(actions: List<NativeAction>): Boolean =
        prefs
            .edit()
            .putString(
                KEY_ACTIONS,
                JSONArray().apply { actions.forEach { put(it.toJson()) } }.toString(),
            )
            .commit()

    private companion object {
        val LOCK = Any()
    }
}
