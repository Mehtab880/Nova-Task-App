#!/usr/bin/env node
/**
 * Fails if the required Plus Jakarta Sans / Roboto font files are missing or
 * corrupt. The typography tokens are parsed so the check cannot drift from the
 * font families actually used by the app.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const fontsDir = join(root, 'apps', 'mobile', 'assets', 'fonts');
const typographyPath = join(root, 'apps', 'mobile', 'src', 'design', 'tokens', 'typography.ts');

const REQUIRED_PLUS_JAKARTA = [
  'PlusJakartaSans-Regular.ttf',
  'PlusJakartaSans-Medium.ttf',
  'PlusJakartaSans-SemiBold.ttf',
  'PlusJakartaSans-Bold.ttf',
];
const REQUIRED_ROBOTO = ['Roboto-Regular.ttf'];
const MIN_FONT_BYTES = 10_000;
const TTF_SIGNATURES = new Set(['00010000', 'OTTO', 'true', 'ttcf']);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

function fontFamilyFile(family) {
  return family === 'Roboto' ? 'Roboto-Regular.ttf' : `${family}.ttf`;
}

let typographySource;
try {
  typographySource = readFileSync(typographyPath, 'utf8');
} catch {
  fail(`Missing typography tokens: ${typographyPath}`);
  process.exit(1);
}

const block = /export const fontFamilies = \{([\s\S]*?)\} as const;/.exec(typographySource);
if (!block || block[1] === undefined) {
  fail('Could not parse fontFamilies from typography.ts');
  process.exit(1);
}

const tokenFamilies = [...block[1].matchAll(/:\s*'([^']+)'/g)].map(match => match[1]);
const expectedFonts = [
  ...new Set([...tokenFamilies.map(fontFamilyFile), ...REQUIRED_PLUS_JAKARTA, ...REQUIRED_ROBOTO]),
];

console.log(`Font directory: ${fontsDir}`);
console.log(`Typography families: ${tokenFamilies.join(', ')}`);
console.log('');

for (const file of expectedFonts) {
  const fullPath = join(fontsDir, file);

  try {
    const stats = statSync(fullPath);
    if (!stats.isFile()) {
      fail(`${file} is not a file`);
      continue;
    }
    if (stats.size < MIN_FONT_BYTES) {
      fail(`${file} is suspiciously small (${stats.size} bytes)`);
      continue;
    }

    const header = readFileSync(fullPath).subarray(0, 4).toString('hex');
    if (!TTF_SIGNATURES.has(header)) {
      fail(`${file} is not a valid TrueType/OpenType font (header ${header})`);
      continue;
    }

    console.log(`✓ ${file} (${stats.size.toLocaleString()} bytes)`);
  } catch {
    fail(`Missing required font: ${file}`);
  }
}

if (process.exitCode === 1) {
  console.error('\nFont check failed. Run: pnpm dlx react-native-asset or restore the files.');
} else {
  console.log(`\nFont check passed (${expectedFonts.length} files).`);
}
