import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from './PlaceholderScreen';

export function TodayScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen
      title={t('screens.today.title')}
      description={t('screens.today.description')}
    />
  );
}
