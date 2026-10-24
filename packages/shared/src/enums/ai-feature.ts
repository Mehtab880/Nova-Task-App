/**
 * AI capabilities that Nova may offer in future milestones.
 * M0 only defines the contract; no AI feature is implemented.
 */
export const AiFeature = {
  TaskBreakdown: 'task_breakdown',
  SmartSchedule: 'smart_schedule',
  NaturalLanguageCapture: 'natural_language_capture',
  DailyBriefing: 'daily_briefing',
  InboxTriage: 'inbox_triage',
} as const;

export type AiFeature = (typeof AiFeature)[keyof typeof AiFeature];
