/**
 * User-assigned task priority. `None` is explicit rather than null so the
 * contract remains stable when persistence is added.
 */
export const Priority = {
  None: 'none',
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Urgent: 'urgent',
} as const;

export type Priority = (typeof Priority)[keyof typeof Priority];
