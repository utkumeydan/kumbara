import { useState } from 'react';
import { View } from 'react-native';
import { TurtleFace } from '@/components/Turtle';
import { useToast } from '@/components/Toast';
import { Button, Card, ErrorText, Field, Header, Screen, T } from '@/components/ui';
import { api, useApiMutation } from '@/lib/api';
import { goBack } from '@/lib/nav';

// Saati eşleştir: saatteki uygulama 6 haneli bir kod gösterir, kod burada onaylanır
export default function Watch() {
  const toast = useToast();
  const [code, setCode] = useState('');
  const confirm = useApiMutation(() => api('POST', '/watch/confirm', { code }));
  return (
    <Screen header={<Header title="Saati bağla" onClose={goBack} />}>
      <View style={{ alignItems: 'center', marginVertical: 8 }}>
        <TurtleFace size={110} stage={2} />
      </View>
      <Card style={{ gap: 6 }}>
        <T v="label">1. Saatinde Kumbara’yı aç</T>
        <T v="small" muted>Saat ekranında 6 haneli bir kod göreceksin (10 dakika geçerli).</T>
        <T v="label" style={{ marginTop: 8 }}>2. Kodu buraya yaz</T>
        <T v="small" muted>Saat kalan tutarı, günlük payı ve serini göstermeye başlar. Ayarlar &gt; Açık oturumlar’dan istediğin zaman kaldırabilirsin.</T>
      </Card>
      <Field
        label="Saatteki kod"
        value={code}
        onChangeText={(s) => setCode(s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
        placeholder="ABC123"
        autoCapitalize="characters"
        style={{ fontSize: 26, letterSpacing: 6, fontWeight: '800', textAlign: 'center' }}
      />
      <ErrorText error={confirm.error} />
      <Button
        title="Saati bağla"
        disabled={code.length !== 6}
        loading={confirm.isPending}
        onPress={() =>
          confirm.mutate(undefined, {
            onSuccess: () => {
              toast({ message: 'Saat bağlandı ⌚' });
              goBack();
            },
          })
        }
      />
    </Screen>
  );
}
