import { useTranslation } from 'react-i18next';

import { SettingsScreen } from '@/tasks/ui/SettingsScreen';

export function NovaScreen(): React.JSX.Element {
  const { t } = useTranslation();
  void t;
  return <SettingsScreen />;
}
