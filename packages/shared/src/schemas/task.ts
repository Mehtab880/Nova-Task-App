import { z } from 'zod';

import { AiFeature } from '../enums/ai-feature';
import { Priority } from '../enums/priority';
import { TaskStatus } from '../enums/task-status';

/** Canonical Crockford base32 ULID. */
export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const ulidSchema = z.string().regex(ULID_REGEX, 'Expected a 26-character ULID');

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const taskStatusSchema = z.enum(TaskStatus);
export const prioritySchema = z.enum(Priority);
export const aiFeatureSchema = z.enum(AiFeature);

export const taskSummarySchema = z
  .object({
    id: ulidSchema,
    title: z.string().trim().min(1).max(500),
    status: taskStatusSchema,
    priority: prioritySchema,
    dueAt: isoDateTimeSchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export type TaskSummary = z.infer<typeof taskSummarySchema>;
