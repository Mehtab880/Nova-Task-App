import { environment } from '@/core/env/environment';
import { logger } from '@/core/logging';

import { runM0Spike } from './m0-spike';

let hasRun = false;

/**
 * Dev-only entry point. Called once per app launch from App.tsx when
 * NOVA_ENABLE_M0_SPIKE=true and the dev flavor is active.
 */
export async function runM0SpikeAndLog(): Promise<void> {
  if (!environment.m0SpikeEnabled || hasRun) {
    return;
  }

  hasRun = true;

  try {
    await runM0Spike();
  } catch (error) {
    logger.error('M0 SQLite spike could not run', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
