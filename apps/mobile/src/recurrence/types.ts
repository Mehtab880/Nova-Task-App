export const RECURRENCE_FREQUENCIES = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const;

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const MONTHLY_MODES = ['day_of_month', 'nth_weekday'] as const;
export type MonthlyMode = (typeof MONTHLY_MODES)[number];

export interface RecurrencePattern {
  readonly frequency: RecurrenceFrequency;
  /** Every N days/weeks/months/years. Always >= 1. */
  readonly interval: number;
  /** ISO weekdays, Monday = 1 ... Sunday = 7. */
  readonly weekdays: readonly number[];
  readonly monthlyMode: MonthlyMode;
  /** 1-31, or -1 for the last day of the month. */
  readonly monthDay: number | null;
  /** 1-4, or -1 for the last matching weekday of the month. */
  readonly nth: number | null;
  /** ISO weekday for nth-weekday monthly rules. */
  readonly weekday: number | null;
  readonly startDate: string;
  readonly startTime: string | null;
  readonly timezone: string;
  readonly endDate: string | null;
  readonly endAfterCount: number | null;
  readonly repeatAfterCompletion: boolean;
}

export interface RecurrenceRule extends RecurrencePattern {
  readonly id: string;
  readonly taskId: string;
  readonly completedCount: number;
  readonly isActive: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface GeneratedOccurrence {
  readonly date: string;
  readonly time: string | null;
  /** 1-based ordinal within the series, including occurrences before the window. */
  readonly sequence: number;
  /** Epoch milliseconds when the rule carries a wall-clock time. */
  readonly epochMillis: number | null;
  readonly shifted: boolean;
  readonly ambiguous: boolean;
}

export interface GenerateOptions {
  /** Inclusive local-date window start. Defaults to the rule start date. */
  readonly fromDate?: string;
  /** Inclusive local-date window end. */
  readonly toDate: string;
  readonly maxOccurrences?: number;
}

export const MAX_RECURRENCE_SCAN_DAYS = 200_000;
