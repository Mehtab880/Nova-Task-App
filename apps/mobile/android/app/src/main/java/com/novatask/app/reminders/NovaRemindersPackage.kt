package com.novatask.app.reminders

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * Registers the app-local NovaReminders module. The module is intentionally
 * app-local rather than an npm package: it is the only native dependency M4 adds.
 */
class NovaRemindersPackage : BaseReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == NovaRemindersModule.NAME) NovaRemindersModule(reactContext) else null

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
        ReactModuleInfoProvider {
            mapOf(
                NovaRemindersModule.NAME to
                    ReactModuleInfo(
                        NovaRemindersModule.NAME,
                        NovaRemindersModule::class.java.name,
                        false,
                        false,
                        false,
                        false,
                    ),
            )
        }
}
