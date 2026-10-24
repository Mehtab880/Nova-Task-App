import { useTranslation } from 'react-i18next';

import { environment } from '@/core/env/environment';
import { ReminderDevToolsCard } from '@/reminders/ui/ReminderDevToolsCard';

import { PlaceholderScreen } from './PlaceholderScreen';

export function NovaScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen
      title={t('screens.nova.title')}
      description={t('screens.nova.description')}
      {...(environment.m4Enabled ? { footer: <ReminderDevToolsCard /> } : {})}
    />
  );
}
