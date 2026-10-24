import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';

export type ReminderTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export interface CardProps {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

export function Card({ children, style }: CardProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderRadius: theme.radius.lg,
          borderWidth: theme.sizes.borderHairline,
          borderColor: theme.colors.border,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface SectionTitleProps {
  readonly children: string;
}

export function SectionTitle({ children }: SectionTitleProps): React.JSX.Element {
  return (
    <AppText variant="subheading" accessibilityRole="header">
      {children}
    </AppText>
  );
}

export interface KeyValueRowProps {
  readonly label: string;
  readonly value: string;
  readonly tone?: ReminderTone;
}

export function KeyValueRow({
  label,
  value,
  tone = 'neutral',
}: KeyValueRowProps): React.JSX.Element {
  const theme = useTheme();
  const valueColor =
    tone === 'error'
      ? theme.colors.error
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'success'
          ? theme.colors.success
          : tone === 'info'
            ? theme.colors.brandPrimary
            : theme.colors.text;

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' }}>
      <AppText variant="bodySmall" color="textMuted" style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" style={{ flex: 1, color: valueColor, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  );
}

export interface StatusBadgeProps {
  readonly label: string;
  readonly tone?: ReminderTone;
}

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps): React.JSX.Element {
  const theme = useTheme();
  const colors =
    tone === 'error'
      ? { background: theme.colors.errorSurface, text: theme.colors.error }
      : tone === 'warning'
        ? { background: theme.colors.warningSurface, text: theme.colors.warning }
        : tone === 'success'
          ? { background: theme.colors.successSurface, text: theme.colors.success }
          : tone === 'info'
            ? { background: theme.colors.brandPrimaryMuted, text: theme.colors.brandPrimary }
            : { background: theme.colors.surfaceSunken, text: theme.colors.textMuted };

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xxs,
        borderRadius: theme.radius.full,
        backgroundColor: colors.background,
      }}
    >
      <AppText variant="caption" style={{ color: colors.text }}>
        {label}
      </AppText>
    </View>
  );
}

export interface IssueCardProps {
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
}

export function IssueCard({ severity, message }: IssueCardProps): React.JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  const severityLabel =
    severity === 'error'
      ? t('reminders.severity.error')
      : severity === 'warning'
        ? t('reminders.severity.warning')
        : t('reminders.severity.info');
  const borderColor =
    severity === 'error'
      ? theme.colors.error
      : severity === 'warning'
        ? theme.colors.warning
        : theme.colors.brandPrimary;

  return (
    <View
      style={{
        borderLeftWidth: theme.spacing.xs,
        borderLeftColor: borderColor,
        paddingLeft: theme.spacing.md,
        gap: theme.spacing.xs,
      }}
    >
      <StatusBadge label={severityLabel} tone={severity === 'info' ? 'info' : severity} />
      <AppText variant="bodySmall">{message}</AppText>
    </View>
  );
}
