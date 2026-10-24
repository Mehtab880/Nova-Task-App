import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';
import type { RootStackParamList } from '@/navigation/types';

import { ActionButton } from './ActionButton';
import { Card, SectionTitle, StatusBadge } from './Primitives';

export function ReminderDevToolsCard(): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <SectionTitle>{t('reminders.devTools.title')}</SectionTitle>
        <StatusBadge label={t('reminders.devTools.devOnly')} tone="info" />
      </View>
      <AppText variant="bodySmall" color="textMuted">
        {t('reminders.devTools.description')}
      </AppText>
      <ActionButton
        label={t('reminders.devTools.test')}
        onPress={() => navigation.navigate('ReminderTest')}
      />
      <ActionButton
        label={t('reminders.devTools.diagnostics')}
        variant="secondary"
        onPress={() => navigation.navigate('ReminderDiagnostics')}
      />
    </Card>
  );
}
