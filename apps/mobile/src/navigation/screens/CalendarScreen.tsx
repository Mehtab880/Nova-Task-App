import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from './PlaceholderScreen';

export function CalendarScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen
      title={t('screens.calendar.title')}
      description={t('screens.calendar.description')}
    />
  );
}
