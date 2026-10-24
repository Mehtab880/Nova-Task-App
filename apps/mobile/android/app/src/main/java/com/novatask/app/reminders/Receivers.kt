package com.novatask.app.reminders

/** Restores alarms after reboot. Force-stopped apps do not receive this. */
internal class BootReceiver : RescheduleReceiver("boot-completed")

/** Restores alarms after an in-place package update. */
internal class AppUpdateReceiver : RescheduleReceiver("my-package-replaced")

/** Rebuilds alarms after a wall-clock, date, or time-zone change. */
internal class TimeChangeReceiver : RescheduleReceiver("time-or-timezone-changed")

/** Rebuilds exact alarms when the user grants exact-alarm access. */
internal class ExactAlarmPermissionReceiver : RescheduleReceiver("exact-alarm-permission-changed")
