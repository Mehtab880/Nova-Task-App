package com.novatask.app.reminders

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.novatask.app.BuildConfig

@ReactModule(name = NovaRemindersModule.NAME)
class NovaRemindersModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    private val appContext = reactContext.applicationContext
    private val store = ReminderAlarmStore(appContext)
    private val actionQueue = ReminderActionQueue(appContext)
    private val scheduler = ReminderScheduler(appContext, store)
    private val notifier = ReminderNotifier(appContext)

    override fun getName(): String = NAME

    override fun getConstants(): Map<String, Any> =
        mapOf(
            "APP_ENV" to BuildConfig.APP_ENV,
            "MAX_PENDING_ALARMS" to MAX_PENDING_ALARMS,
            "CHANNEL_ID" to CHANNEL_ID,
        )

    @ReactMethod
    fun getNotificationState(promise: Promise) {
        runCatching { notificationStateMap() }
            .onSuccess { promise.resolve(it) }
            .onFailure { promise.reject("E_NOVA_REMINDERS_STATE", it.message, it) }
    }

    @ReactMethod
    fun requestNotificationPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            store.recordNotificationRequested()
            promise.resolve(notificationPermissionStatus())
            return
        }
        if (
            ContextCompat.checkSelfPermission(
                appContext,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            store.recordNotificationRequested()
            promise.resolve("granted")
            return
        }
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "Notification permission requires a foreground activity")
            return
        }
        if (activity !is PermissionAwareActivity) {
            promise.reject("E_NO_ACTIVITY", "Activity cannot request runtime permissions")
            return
        }
        reactContext.runOnUiQueueThread {
            try {
                store.recordNotificationRequested()
                activity.requestPermissions(
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    NOTIFICATION_PERMISSION_REQUEST,
                ) { _, _, grantResults ->
                    val granted =
                        grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
                    promise.resolve(if (granted) "granted" else "denied")
                    true
                }
            } catch (error: RuntimeException) {
                promise.reject("E_NOVA_REMINDERS_PERMISSION", error.message, error)
            }
        }
    }

    @ReactMethod
    fun openNotificationSettings(promise: Promise) {
        val intent =
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, appContext.packageName)
        startSettingsIntent(intent, promise)
    }

    @ReactMethod
    fun openExactAlarmSettings(promise: Promise) {
        val intent =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Intent(
                    Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:${appContext.packageName}"),
                )
            } else {
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:${appContext.packageName}"),
                )
            }
        startSettingsIntent(intent, promise)
    }

    @ReactMethod
    fun reconcile(reminders: ReadableArray, reason: String, promise: Promise) {
        val parsed =
            try {
                (0 until reminders.size()).map { index ->
                    parseReminder(reminders.getMap(index) ?: error("Reminder at $index is null"))
                }
            } catch (error: RuntimeException) {
                promise.reject("E_NOVA_REMINDERS_INVALID", error.message, error)
                return
            }
        ReceiverWork.executor.execute {
            try {
                promise.resolve(outcomeToMap(scheduler.reconcile(parsed, reason)))
            } catch (error: RuntimeException) {
                promise.reject("E_NOVA_REMINDERS_RECONCILE", error.message, error)
            }
        }
    }

    @ReactMethod
    fun rescheduleFromStore(reason: String, promise: Promise) {
        ReceiverWork.executor.execute {
            try {
                promise.resolve(outcomeToMap(scheduler.rescheduleFromStore(reason)))
            } catch (error: RuntimeException) {
                promise.reject("E_NOVA_REMINDERS_RESCHEDULE", error.message, error)
            }
        }
    }

    @ReactMethod
    fun notifyNow(reminder: ReadableMap, promise: Promise) {
        val parsed =
            try {
                parseReminder(reminder)
            } catch (error: RuntimeException) {
                promise.reject("E_NOVA_REMINDERS_INVALID", error.message, error)
                return
            }
        ReceiverWork.executor.execute {
            try {
                val delivery =
                    notifier.showReminder(
                        parsed.copy(
                            triggerAt = System.currentTimeMillis(),
                            status = STATUS_SCHEDULED,
                        ),
                    )
                promise.resolve(delivery.name.lowercase())
            } catch (error: RuntimeException) {
                promise.reject("E_NOVA_REMINDERS_NOTIFY", error.message, error)
            }
        }
    }

    @ReactMethod
    fun drainActions(promise: Promise) {
        runCatching {
                val actions = actionQueue.pending()
                Arguments.createArray().apply {
                    actions.forEach { action ->
                        pushMap(
                            Arguments.createMap().apply {
                                putString("actionId", action.actionId)
                                putString("type", action.type)
                                putString("reminderId", action.reminderId)
                                putInt("requestCode", action.requestCode)
                                putDouble("occurredAt", action.occurredAt.toDouble())
                                if (action.snoozedUntil == null) {
                                    putNull("snoozedUntil")
                                } else {
                                    putDouble("snoozedUntil", action.snoozedUntil.toDouble())
                                }
                                putString("title", action.title)
                                putString("body", action.body)
                            },
                        )
                    }
                }
            }
            .onSuccess { promise.resolve(it) }
            .onFailure { promise.reject("E_NOVA_REMINDERS_QUEUE", it.message, it) }
    }

    @ReactMethod
    fun acknowledgeActions(actionIds: ReadableArray, promise: Promise) {
        runCatching {
                val ids = (0 until actionIds.size()).mapNotNull { actionIds.getString(it) }.toSet()
                actionQueue.acknowledge(ids)
            }
            .onSuccess { promise.resolve(it) }
            .onFailure { promise.reject("E_NOVA_REMINDERS_QUEUE", it.message, it) }
    }

    @ReactMethod
    fun getDiagnostics(promise: Promise) {
        ReceiverWork.executor.execute {
            try {
                promise.resolve(diagnosticsMap())
            } catch (error: RuntimeException) {
                promise.reject("E_NOVA_REMINDERS_DIAGNOSTICS", error.message, error)
            }
        }
    }

    private fun notificationStateMap(): WritableMap {
        notifier.ensureChannel()
        val channel = notifier.channelState()
        val exactState =
            when {
                Build.VERSION.SDK_INT < Build.VERSION_CODES.S -> "notApplicable"
                scheduler.canScheduleExact() -> "granted"
                else -> "denied"
            }
        return Arguments.createMap().apply {
            putString("notificationPermission", notificationPermissionStatus())
            putBoolean("appNotificationsEnabled", notifier.notificationsEnabled())
            putBoolean("channelExists", channel.exists)
            putInt("channelImportance", channel.importance)
            putBoolean("channelBlocked", channel.blocked)
            putString("exactAlarm", exactState)
            putBoolean("exactAlarmSupported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            putBoolean("batteryOptimizationIgnored", scheduler.isIgnoringBatteryOptimizations())
            putBoolean("powerSaveMode", scheduler.isPowerSaveMode())
            putBoolean("deviceIdleMode", scheduler.isDeviceIdleMode())
            putInt("sdkInt", Build.VERSION.SDK_INT)
        }
    }

    private fun notificationPermissionStatus(): String {
        val notificationsEnabled = notifier.notificationsEnabled()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return if (notificationsEnabled) "granted" else "denied"
        }
        val granted =
            ContextCompat.checkSelfPermission(
                appContext,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
        return when {
            granted -> "granted"
            store.notificationRequested() -> "denied"
            else -> "notDetermined"
        }
    }

    private fun diagnosticsMap(): WritableMap {
        val snapshot = store.snapshot()
        val pendingActions = actionQueue.pending()
        val entries = snapshot.reminders
        val exactCount = entries.count { it.scheduleMode.startsWith("exact") }
        val inexactCount = entries.count { it.scheduleMode.startsWith("inexact") }
        val deferredCount = entries.count { it.scheduleMode == "deferred-cap" }
        val errorCount = entries.count { it.scheduleMode == "error" }
        val deliveredCount = entries.count { it.scheduleMode == "delivered-active" }
        val blockedCount =
            entries.count {
                it.scheduleMode == "blocked-notification-permission" ||
                    it.scheduleMode == "blocked-notification-channel"
            }

        return Arguments.createMap().apply {
            putDouble("generatedAt", System.currentTimeMillis().toDouble())
            putString("version", "m4-poc-1")
            putMap("permissions", notificationStateMap())
            putMap(
                "store",
                Arguments.createMap().apply {
                    putInt("count", entries.size)
                    putInt("exactCount", exactCount)
                    putInt("inexactCount", inexactCount)
                    putInt("deferredCount", deferredCount)
                    putInt("errorCount", errorCount)
                    putInt("deliveredCount", deliveredCount)
                    putInt("blockedCount", blockedCount)
                    putInt("cap", MAX_PENDING_ALARMS)
                    putNullableDouble("lastReconciledAt", snapshot.lastReconciledAt)
                    putNullableString("lastReconcileReason", snapshot.lastReconcileReason)
                    putNullableDouble("lastRescheduleAt", snapshot.lastRescheduleAt)
                    putNullableString("lastRescheduleReason", snapshot.lastRescheduleReason)
                    putArray(
                        "entries",
                        Arguments.createArray().apply {
                            entries.forEach { entry ->
                                pushMap(
                                    Arguments.createMap().apply {
                                        putString("id", entry.id)
                                        putInt("requestCode", entry.requestCode)
                                        putString("title", entry.title)
                                        putDouble("triggerAt", entry.triggerAt.toDouble())
                                        putString("status", entry.status)
                                        putString("scheduleMode", entry.scheduleMode)
                                        putNullableString("scheduleReason", entry.scheduleReason)
                                        putNullableDouble("scheduledAt", entry.scheduledAt)
                                        putNullableDouble("lastFiredAt", entry.lastFiredAt)
                                        putNullableString("deliveryState", entry.deliveryState)
                                        putBoolean(
                                            "pendingIntentExists",
                                            ReminderPolicy.hasPendingAlarm(entry.scheduleMode) &&
                                                scheduler.pendingIntentExists(entry),
                                        )
                                    },
                                )
                            }
                        },
                    )
                },
            )
            putMap(
                "queue",
                Arguments.createMap().apply {
                    putInt("pendingCount", pendingActions.size)
                    putArray(
                        "actions",
                        Arguments.createArray().apply {
                            pendingActions.take(50).forEach { action ->
                                pushMap(
                                    Arguments.createMap().apply {
                                        putString("actionId", action.actionId)
                                        putString("type", action.type)
                                        putString("reminderId", action.reminderId)
                                        putDouble("occurredAt", action.occurredAt.toDouble())
                                    },
                                )
                            }
                        },
                    )
                },
            )
        }
    }

    private fun outcomeToMap(outcome: ReconcileOutcome): WritableMap =
        Arguments.createMap().apply {
            putDouble("reconciledAt", outcome.reconciledAt.toDouble())
            putInt("cap", outcome.cap)
            putInt("scheduledCount", outcome.scheduledCount)
            putInt("exactCount", outcome.exactCount)
            putInt("inexactCount", outcome.inexactCount)
            putInt("deferredCount", outcome.deferredCount)
            putInt("errorCount", outcome.errorCount)
            putArray(
                "results",
                Arguments.createArray().apply {
                    outcome.results.forEach { result ->
                        pushMap(
                            Arguments.createMap().apply {
                                putString("id", result.id)
                                putInt("requestCode", result.requestCode)
                                putString("state", result.state)
                                putNullableString("reason", result.reason)
                                putNullableDouble("scheduledFor", result.scheduledFor)
                                putBoolean("notificationActive", result.notificationActive)
                            },
                        )
                    }
                },
            )
        }

    private fun parseReminder(map: ReadableMap): StoredReminder {
        val id = map.getString("id")?.takeIf { it.isNotBlank() } ?: error("Reminder id is required")
        val requestCode =
            if (map.hasKey("requestCode")) map.getInt("requestCode")
            else error("Reminder requestCode is required")
        if (!ReminderPolicy.isValidRequestCode(requestCode)) {
            error("Reminder requestCode must be between 1 and $MAX_REQUEST_CODE")
        }
        val triggerAt =
            if (map.hasKey("triggerAt")) map.getDouble("triggerAt").toLong()
            else error("Reminder triggerAt is required")
        if (triggerAt <= 0) error("Reminder triggerAt must be positive")
        return StoredReminder(
            id = id,
            requestCode = requestCode,
            title = if (map.hasKey("title")) map.getString("title").orEmpty() else "",
            body = if (map.hasKey("body")) map.getString("body").orEmpty() else "",
            triggerAt = triggerAt,
            status = if (map.hasKey("status")) map.getString("status") ?: STATUS_SCHEDULED else STATUS_SCHEDULED,
            updatedAt = System.currentTimeMillis(),
        )
    }

    private fun startSettingsIntent(intent: Intent, promise: Promise) {
        reactContext.runOnUiQueueThread {
            try {
                val activity = reactContext.currentActivity
                if (activity != null) {
                    activity.startActivity(intent)
                } else {
                    appContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                promise.resolve(true)
            } catch (error: RuntimeException) {
                promise.reject("E_NOVA_REMINDERS_SETTINGS", error.message, error)
            }
        }
    }

    private fun WritableMap.putNullableString(key: String, value: String?) {
        if (value == null) putNull(key) else putString(key, value)
    }

    private fun WritableMap.putNullableDouble(key: String, value: Long?) {
        if (value == null) putNull(key) else putDouble(key, value.toDouble())
    }

    companion object {
        const val NAME = "NovaReminders"
        private const val NOTIFICATION_PERMISSION_REQUEST = 7_431
    }
}
