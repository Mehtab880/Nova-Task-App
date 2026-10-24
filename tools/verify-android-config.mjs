#!/usr/bin/env node
/**
 * Static Android configuration audit for Nova Task (M0 + M4).
 * This complements the Gradle build; it cannot validate runtime behavior.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const androidDir = join(root, 'apps', 'mobile', 'android');
const appDir = join(androidDir, 'app');

const files = {
  rootGradle: readFileSync(join(androidDir, 'build.gradle'), 'utf8'),
  appGradle: readFileSync(join(appDir, 'build.gradle'), 'utf8'),
  gradleProperties: readFileSync(join(androidDir, 'gradle.properties'), 'utf8'),
  manifest: readFileSync(join(appDir, 'src', 'main', 'AndroidManifest.xml'), 'utf8'),
  strings: readFileSync(join(appDir, 'src', 'main', 'res', 'values', 'strings.xml'), 'utf8'),
  reminderModels: readFileSync(
    join(appDir, 'src', 'main', 'java', 'com', 'novatask', 'app', 'reminders', 'ReminderModels.kt'),
    'utf8',
  ),
  reminderScheduler: readFileSync(
    join(
      appDir,
      'src',
      'main',
      'java',
      'com',
      'novatask',
      'app',
      'reminders',
      'ReminderScheduler.kt',
    ),
    'utf8',
  ),
  dataRules: readFileSync(
    join(appDir, 'src', 'main', 'res', 'xml', 'data_extraction_rules.xml'),
    'utf8',
  ),
};

const failures = [];

function check(label, condition, detail) {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(label);
  }
}

function matches(source, pattern) {
  return new RegExp(pattern, 'm').test(source);
}

check('minSdk is 26', matches(files.rootGradle, 'minSdkVersion\\s*=\\s*26'));
check('compileSdk is 36', matches(files.rootGradle, 'compileSdkVersion\\s*=\\s*36'));
check('targetSdk is 36', matches(files.rootGradle, 'targetSdkVersion\\s*=\\s*36'));
check(
  'no compileSdk override above 36',
  !matches(files.rootGradle, 'compileSdkVersion\\s*=\\s*(3[7-9]|[4-9][0-9])'),
);

check(
  'dev application ID',
  matches(files.appGradle, 'applicationId\\s+"com\\.novatask\\.app\\.dev"'),
);
check(
  'staging application ID',
  matches(files.appGradle, 'applicationId\\s+"com\\.novatask\\.app\\.staging"'),
);
check(
  'prod application ID',
  matches(files.appGradle, 'applicationId\\s+"com\\.novatask\\.app"\\s*$'),
);
check(
  'namespace is com.novatask.app',
  matches(files.appGradle, 'namespace\\s+"com\\.novatask\\.app"'),
);

check('Hermes enabled', matches(files.gradleProperties, '^hermesEnabled=true$'));
check('New Architecture enabled', matches(files.gradleProperties, '^newArchEnabled=true$'));
check('edge-to-edge enabled', matches(files.gradleProperties, '^edgeToEdgeEnabled=true$'));

check(
  'R8/ProGuard enabled for release',
  matches(files.appGradle, 'def enableProguardInReleaseBuilds = true'),
);
check(
  'release minify enabled',
  matches(files.appGradle, 'minifyEnabled enableProguardInReleaseBuilds'),
);
check(
  'release resource shrinking enabled',
  matches(files.appGradle, 'shrinkResources enableProguardInReleaseBuilds'),
);
check(
  'release signing uses keystore.properties when present',
  matches(
    files.appGradle,
    'signingConfig releaseSigningConfigured \\? signingConfigs\\.release : signingConfigs\\.debug',
  ),
);
check(
  'missing release signing warns and can fail closed',
  matches(files.appGradle, 'NON-DISTRIBUTABLE RELEASE') &&
    matches(files.appGradle, 'requireReleaseSigning'),
);

check('allowBackup=false', matches(files.manifest, 'android:allowBackup="false"'));
check(
  'predictive back enabled',
  matches(files.manifest, 'android:enableOnBackInvokedCallback="true"'),
);
check('data extraction rules wired', matches(files.manifest, 'android:dataExtractionRules='));
check('task database excluded from backup', /nova\.db/.test(files.dataRules));

// M4 needs user-visible notifications and user-grantable exact alarms.
const requiredPermissions = [
  'android.permission.INTERNET',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.SCHEDULE_EXACT_ALARM',
];
for (const permission of requiredPermissions) {
  check(`declares ${permission}`, files.manifest.includes(permission));
}

// These would broaden M4 beyond the approved proof of concept.
const forbiddenPermissions = [
  'USE_EXACT_ALARM',
  'VIBRATE',
  'FOREGROUND_SERVICE',
  'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
];
for (const permission of forbiddenPermissions) {
  check(
    `no ${permission} permission`,
    !matches(files.manifest, `uses-permission[^>]*android\\.permission\\.${permission}`),
  );
}

const receivers = [
  'ReminderAlarmReceiver',
  'ReminderActionReceiver',
  'BootReceiver',
  'AppUpdateReceiver',
  'TimeChangeReceiver',
  'ExactAlarmPermissionReceiver',
];
for (const receiver of receivers) {
  check(
    `declares ${receiver}`,
    matches(files.manifest, `android:name="\\.reminders\\.${receiver}"`),
  );
}
check(
  'reminder receivers are not exported',
  !matches(
    files.manifest,
    'android:name="\\.reminders\\.[A-Za-z]+Receiver"[\\s\\S]{0,80}android:exported="true"',
  ),
);
check(
  'boot receiver listens for BOOT_COMPLETED',
  matches(files.manifest, 'android\\.intent\\.action\\.BOOT_COMPLETED'),
);
check(
  'time-zone changes rebuild alarms',
  matches(files.manifest, 'android\\.intent\\.action\\.TIMEZONE_CHANGED'),
);
check(
  'exact-alarm permission changes rebuild alarms',
  matches(files.manifest, 'SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED'),
);
check(
  'task_reminders channel id is stable',
  matches(files.reminderModels, 'CHANNEL_ID = "task_reminders"'),
);
check('native pending-alarm cap is 200', matches(files.reminderModels, 'MAX_PENDING_ALARMS = 200'));
check(
  'exact alarms use setExactAndAllowWhileIdle',
  matches(files.reminderScheduler, 'setExactAndAllowWhileIdle'),
);
check(
  'inexact fallback uses setAndAllowWhileIdle',
  matches(files.reminderScheduler, 'setAndAllowWhileIdle'),
);
check(
  'notification channel label present',
  /notification_channel_reminders_name/.test(files.strings),
);
check('androidx core is a direct dependency', matches(files.appGradle, 'androidx\\.core:core-ktx'));

const flavorIds = [...files.appGradle.matchAll(/applicationId\s+"(com\.novatask\.app[^"]*)"/g)].map(
  match => match[1],
);
check(
  'exactly three flavors (dev/staging/prod)',
  new Set(flavorIds).size === 3 &&
    flavorIds.includes('com.novatask.app.dev') &&
    flavorIds.includes('com.novatask.app.staging') &&
    flavorIds.includes('com.novatask.app'),
  `found: ${flavorIds.join(', ')}`,
);

console.log('');
if (failures.length > 0) {
  console.error(`Android config audit failed (${failures.length} check(s)).`);
  process.exit(1);
}

console.log('Android config audit passed.');
