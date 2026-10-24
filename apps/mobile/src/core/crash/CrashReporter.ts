export type CrashContext = Readonly<Record<string, string | number | boolean>>;

/**
 * Vendor-neutral crash reporting boundary. M0 intentionally ships a no-op.
 * Sentry/Bugsnag integration arrives in a later milestone without changing
 * call sites.
 */
export interface CrashReporter {
  recordError(error: unknown, context?: CrashContext): void;
  setUserId(userId: string | null): void;
}

export const noopCrashReporter: CrashReporter = Object.freeze({
  recordError: (_error: unknown, _context?: CrashContext): void => {
    // Intentionally empty until a crash backend is approved.
  },
  setUserId: (_userId: string | null): void => {
    // Intentionally empty until a crash backend is approved.
  },
});
