import { useTranslation } from 'react-i18next';

import { TaskListScreen } from '@/tasks/ui/TaskListScreen';

export function InboxScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <TaskListScreen
      filter="inbox"
      title={t('screens.inbox.title')}
      emptyTitle={t('tasks.empty.inboxTitle')}
      emptyDescription={t('tasks.empty.inboxDescription')}
    />
  );
}
