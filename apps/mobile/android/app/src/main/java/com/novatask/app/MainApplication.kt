package com.novatask.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.novatask.app.reminders.NovaRemindersPackage
import com.novatask.app.reminders.ReminderNotifier

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    val packages = PackageList(this).packages
    packages.add(NovaRemindersPackage())
    getDefaultReactHost(
      context = applicationContext,
      packageList = packages,
    )
  }

  override fun onCreate() {
    super.onCreate()
    ReminderNotifier(this).ensureChannel()
    loadReactNative(this)
  }
}
