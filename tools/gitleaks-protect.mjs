#!/usr/bin/env node
/**
 * Local gitleaks guard for the Husky pre-commit hook.
 * CI enforces gitleaks independently via GitHub Actions.
 */
import { spawnSync } from 'node:child_process';

const probe = spawnSync('gitleaks', ['version'], { encoding: 'utf8', shell: true });
if (probe.error || probe.status !== 0) {
  console.warn(
    '⚠ gitleaks is not installed; skipping the local secret scan. CI still enforces it.',
  );
  process.exit(0);
}

const result = spawnSync(
  'gitleaks',
  ['protect', '--staged', '--redact', '--config', '.gitleaks.toml'],
  { stdio: 'inherit', shell: true },
);

if (result.status !== 0) {
  console.error('✗ gitleaks found a potential secret. Commit blocked.');
  process.exit(result.status ?? 1);
}
