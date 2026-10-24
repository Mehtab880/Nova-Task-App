import { z } from 'zod';

/**
 * Feature capabilities available in the running build. This is intentionally
 * separate from build flavor: a dev build may still ship with AI disabled.
 */
export const capabilitiesSchema = z
  .object({
    ai: z.boolean(),
    billing: z.boolean(),
    voiceCapture: z.boolean(),
    recurrence: z.boolean(),
    cloudBackup: z.boolean(),
    notifications: z.boolean(),
  })
  .strict();

export type Capabilities = Readonly<z.infer<typeof capabilitiesSchema>>;

/** M0 ships none of the post-M0 capabilities. */
export const M0_CAPABILITIES: Capabilities = Object.freeze({
  ai: false,
  billing: false,
  voiceCapture: false,
  recurrence: false,
  cloudBackup: false,
  notifications: false,
});
