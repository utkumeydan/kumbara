import { Link, Stack } from 'expo-router';
import { Empty, Screen, T } from '@/components/ui';
import { useTheme } from '@/lib/theme';

export default function NotFoundScreen() {
  const c = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Bulunamadı' }} />
      <Screen>
        <Empty title="Bu sayfa yok" />
        <Link href="/" style={{ alignSelf: 'center' }}>
          <T v="label" color={c.accent}>Ana sayfaya dön</T>
        </Link>
      </Screen>
    </>
  );
}
