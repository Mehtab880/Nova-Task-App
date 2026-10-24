import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from './PlaceholderScreen';

export function InboxScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen
      title={t('screens.inbox.title')}
      description={t('screens.inbox.description')}
    />
  );
}
