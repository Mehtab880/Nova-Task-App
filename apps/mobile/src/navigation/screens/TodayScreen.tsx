import { useTranslation } from 'react-i18next';

import { TaskListScreen } from '@/tasks/ui/TaskListScreen';

export function TodayScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <TaskListScreen
      filter="today"
      title={t('screens.today.title')}
      emptyTitle={t('tasks.empty.todayTitle')}
      emptyDescription={t('tasks.empty.todayDescription')}
    />
  );
}
