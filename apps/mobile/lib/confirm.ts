import { Alert, Platform } from 'react-native';

// Alert.alert web'de onay düğmesi göstermediği için window.confirm kullanılır
export function confirm(title: string, message: string, destructiveLabel = 'Sil'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
      { text: destructiveLabel, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}
