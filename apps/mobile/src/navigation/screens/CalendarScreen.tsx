import { useTranslation } from 'react-i18next';

import { TaskListScreen } from '@/tasks/ui/TaskListScreen';

export function CalendarScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <TaskListScreen
      filter="upcoming"
      title={t('screens.calendar.title')}
      emptyTitle={t('tasks.empty.upcomingTitle')}
      emptyDescription={t('tasks.empty.upcomingDescription')}
    />
  );
}
