import {
  AiFeature,
  aiFeatureSchema,
  capabilitiesSchema,
  M0_CAPABILITIES,
  Priority,
  prioritySchema,
  taskStatusSchema,
  taskSummarySchema,
  TaskStatus,
  ULID_REGEX,
  ulidSchema,
} from '../index';

const VALID_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('shared enums and schemas', () => {
  it('exposes the expected AI feature values', () => {
    expect(aiFeatureSchema.parse(AiFeature.TaskBreakdown)).toBe('task_breakdown');
    expect(Object.values(AiFeature)).toHaveLength(5);
  });

  it('validates every task status and priority', () => {
    for (const status of Object.values(TaskStatus)) {
      expect(taskStatusSchema.parse(status)).toBe(status);
    }
    for (const priority of Object.values(Priority)) {
      expect(prioritySchema.parse(priority)).toBe(priority);
    }
    expect(prioritySchema.safeParse('someday').success).toBe(false);
  });

  it('accepts valid ULIDs and rejects malformed ones', () => {
    expect(ULID_REGEX.test(VALID_ULID)).toBe(true);
    expect(ulidSchema.parse(VALID_ULID)).toBe(VALID_ULID);
    expect(ulidSchema.safeParse('not-a-ulid').success).toBe(false);
    expect(ulidSchema.safeParse(VALID_ULID.toLowerCase()).success).toBe(false);
  });

  it('parses a complete task summary and rejects unknown fields', () => {
    const summary = {
      id: VALID_ULID,
      title: 'M0 foundation',
      status: TaskStatus.InProgress,
      priority: Priority.High,
      createdAt: '2026-10-24T10:00:00.000Z',
      updatedAt: '2026-10-24T10:00:00.000Z',
    };

    expect(taskSummarySchema.parse(summary)).toEqual(summary);
    expect(taskSummarySchema.safeParse({ ...summary, extra: true }).success).toBe(false);
    expect(taskSummarySchema.safeParse({ ...summary, title: '   ' }).success).toBe(false);
  });

  it('ships M0 with every post-M0 capability disabled', () => {
    expect(capabilitiesSchema.parse(M0_CAPABILITIES)).toEqual(M0_CAPABILITIES);
    expect(Object.values(M0_CAPABILITIES).every(value => value === false)).toBe(true);
  });
});
