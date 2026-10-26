import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { RootStackParamList } from '@/navigation/types';

import { TaskListScreen } from './TaskListScreen';

export function ArchivedScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <TaskListScreen
      filter="archived"
      title={t('screens.archived.title')}
      emptyTitle={t('tasks.empty.archivedTitle')}
      emptyDescription={t('tasks.empty.archivedDescription')}
      showAdd={false}
      onBack={() => navigation.goBack()}
    />
  );
}
