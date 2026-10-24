package com.novatask.app.reminders

import org.json.JSONArray
import org.json.JSONObject

internal const val MODULE_NAME = "NovaReminders"
internal const val CHANNEL_ID = "task_reminders"
internal const val MAX_PENDING_ALARMS = 200
internal const val DEFAULT_SNOOZE_MINUTES = 10
internal const val MAX_REQUEST_CODE = 700_000_000
internal const val PREFS_NAME = "nova_reminders_m4"
internal const val KEY_ALARMS = "alarms_v1"
internal const val KEY_ACTIONS = "actions_v1"
internal const val KEY_LAST_RECONCILED_AT = "last_reconciled_at"
internal const val KEY_LAST_RECONCILE_REASON = "last_reconcile_reason"
internal const val KEY_LAST_RESCHEDULE_AT = "last_reschedule_at"
internal const val KEY_LAST_RESCHEDULE_REASON = "last_reschedule_reason"
internal const val KEY_NOTIFICATION_REQUESTED = "notification_permission_requested"

internal const val STATUS_SCHEDULED = "scheduled"
internal const val STATUS_COMPLETED = "completed"
internal const val STATUS_CANCELLED = "cancelled"

internal const val ACTION_COMPLETE = "complete"
internal const val ACTION_SNOOZE = "snooze"

/**
 * The native representation of one reminder. SQLite remains the source of truth;
 * this object is cached so BroadcastReceivers can fire and snooze without JS.
 */
internal data class StoredReminder(
    val id: String,
    val requestCode: Int,
    val title: String,
    val body: String,
    val triggerAt: Long,
    val status: String = STATUS_SCHEDULED,
    val scheduleMode: String = "pending",
    val scheduleReason: String? = null,
    val scheduledAt: Long? = null,
    val lastFiredAt: Long? = null,
    val deliveryState: String? = null,
    val updatedAt: Long = System.currentTimeMillis(),
) {
    fun toJson(): JSONObject =
        JSONObject().apply {
            put("id", id)
            put("requestCode", requestCode)
            put("title", title)
            put("body", body)
            put("triggerAt", triggerAt)
            put("status", status)
            put("scheduleMode", scheduleMode)
            put("scheduleReason", scheduleReason ?: JSONObject.NULL)
            put("scheduledAt", scheduledAt ?: JSONObject.NULL)
            put("lastFiredAt", lastFiredAt ?: JSONObject.NULL)
            put("deliveryState", deliveryState ?: JSONObject.NULL)
            put("updatedAt", updatedAt)
        }

    companion object {
        fun fromJson(json: JSONObject): StoredReminder =
            StoredReminder(
                id = json.getString("id"),
                requestCode = json.getInt("requestCode"),
                title = json.optString("title", ""),
                body = json.optString("body", ""),
                triggerAt = json.getLong("triggerAt"),
                status = json.optString("status", STATUS_SCHEDULED),
                scheduleMode = json.optString("scheduleMode", "pending"),
                scheduleReason = json.optNullableString("scheduleReason"),
                scheduledAt = json.optNullableLong("scheduledAt"),
                lastFiredAt = json.optNullableLong("lastFiredAt"),
                deliveryState = json.optNullableString("deliveryState"),
                updatedAt = json.optLong("updatedAt", System.currentTimeMillis()),
            )
    }
}

internal data class NativeAction(
    val actionId: String,
    val type: String,
    val reminderId: String,
    val requestCode: Int,
    val occurredAt: Long,
    val snoozedUntil: Long? = null,
    val title: String = "",
    val body: String = "",
) {
    fun toJson(): JSONObject =
        JSONObject().apply {
            put("actionId", actionId)
            put("type", type)
            put("reminderId", reminderId)
            put("requestCode", requestCode)
            put("occurredAt", occurredAt)
            put("snoozedUntil", snoozedUntil ?: JSONObject.NULL)
            put("title", title)
            put("body", body)
        }

    companion object {
        fun fromJson(json: JSONObject): NativeAction =
            NativeAction(
                actionId = json.getString("actionId"),
                type = json.getString("type"),
                reminderId = json.getString("reminderId"),
                requestCode = json.getInt("requestCode"),
                occurredAt = json.getLong("occurredAt"),
                snoozedUntil = json.optNullableLong("snoozedUntil"),
                title = json.optString("title", ""),
                body = json.optString("body", ""),
            )
    }
}

internal data class ScheduleOutcome(
    val id: String,
    val requestCode: Int,
    val state: String,
    val reason: String?,
    val scheduledFor: Long?,
    val notificationActive: Boolean,
)

internal data class ReconcileOutcome(
    val reconciledAt: Long,
    val cap: Int,
    val scheduledCount: Int,
    val exactCount: Int,
    val inexactCount: Int,
    val deferredCount: Int,
    val errorCount: Int,
    val results: List<ScheduleOutcome>,
)

internal data class StoreSnapshot(
    val reminders: List<StoredReminder>,
    val lastReconciledAt: Long?,
    val lastReconcileReason: String?,
    val lastRescheduleAt: Long?,
    val lastRescheduleReason: String?,
)

internal enum class NotificationDelivery {
    POSTED,
    PERMISSION_DENIED,
    CHANNEL_BLOCKED,
    ERROR,
}

internal fun JSONObject.optNullableString(name: String): String? =
    if (has(name) && !isNull(name)) getString(name) else null

internal fun JSONObject.optNullableLong(name: String): Long? =
    if (has(name) && !isNull(name)) getLong(name) else null

internal fun parseReminders(raw: String?): MutableList<StoredReminder> {
    if (raw.isNullOrBlank()) return mutableListOf()
    return runCatching {
            val array = JSONArray(raw)
            MutableList(array.length()) { index -> StoredReminder.fromJson(array.getJSONObject(index)) }
        }
        .getOrElse { mutableListOf() }
}

internal fun parseActions(raw: String?): MutableList<NativeAction> {
    if (raw.isNullOrBlank()) return mutableListOf()
    return runCatching {
            val array = JSONArray(raw)
            MutableList(array.length()) { index -> NativeAction.fromJson(array.getJSONObject(index)) }
        }
        .getOrElse { mutableListOf() }
}
