#!/usr/bin/env node
/**
 * Verifies targetSdk 36 in the Gradle config and, when an APK path is supplied,
 * in the built APK using aapt.
 *
 * Usage:
 *   node tools/verify-target-sdk.mjs
 *   node tools/verify-target-sdk.mjs apps/mobile/android/app/build/outputs/apk/prod/release/app-prod-release.apk
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const gradlePath = join(root, 'apps', 'mobile', 'android', 'build.gradle');
const gradle = readFileSync(gradlePath, 'utf8');
const expected = 36;

const configured = /targetSdkVersion\s*=\s*(\d+)/.exec(gradle)?.[1];
if (configured !== String(expected)) {
  console.error(
    `✗ build.gradle targetSdkVersion is ${configured ?? 'missing'}, expected ${expected}`,
  );
  process.exit(1);
}
console.log(`✓ build.gradle targetSdkVersion=${configured}`);

const apkArg = process.argv[2];
if (apkArg === undefined) {
  console.log('No APK supplied; skipping APK inspection.');
  process.exit(0);
}

const apkPath = join(root, apkArg);
if (!existsSync(apkPath)) {
  console.error(`✗ APK not found: ${apkPath}`);
  process.exit(1);
}

function findAapt() {
  const sdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (sdkRoot === undefined) {
    return null;
  }

  const buildTools = join(sdkRoot, 'build-tools');
  if (!existsSync(buildTools)) {
    return null;
  }

  const versions = readdirSync(buildTools).sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true }),
  );
  for (const version of versions) {
    for (const executable of ['aapt.exe', 'aapt']) {
      const candidate = join(buildTools, version, executable);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

const aapt = findAapt();
if (aapt === null) {
  console.error('✗ Cannot inspect APK: ANDROID_HOME/build-tools/aapt not found.');
  process.exit(1);
}

const result = spawnSync(aapt, ['dump', 'badging', apkPath], { encoding: 'utf8' });
if (result.status !== 0) {
  console.error(result.stderr || '✗ aapt failed');
  process.exit(1);
}

const target = /targetSdkVersion:'(\d+)'/.exec(result.stdout)?.[1];
const minimum = /sdkVersion:'(\d+)'/.exec(result.stdout)?.[1];

if (target !== String(expected)) {
  console.error(`✗ APK targetSdkVersion is ${target ?? 'missing'}, expected ${expected}`);
  process.exit(1);
}
if (minimum !== '26') {
  console.error(`✗ APK minSdkVersion is ${minimum ?? 'missing'}, expected 26`);
  process.exit(1);
}

console.log(`✓ APK targetSdkVersion=${target}, minSdkVersion=${minimum}`);
