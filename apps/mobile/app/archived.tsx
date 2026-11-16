import { router } from 'expo-router';
import { View } from 'react-native';
import { Shape, shapeFor } from '@/components/Shape';
import { useToast } from '@/components/Toast';
import { Button, Card, Empty, ErrorText, Header, Loading, Row, Screen, T } from '@/components/ui';
import { api, ApiError, useApiMutation, useArchived } from '@/lib/api';
import { goBack } from '@/lib/nav';

// Arşivlenmiş zarflar; geri getirilebilir (ücretsiz planda zarf sınırına tabi)
export default function Archived() {
  const toast = useToast();
  const { data, error, refetch } = useArchived();
  const restore = useApiMutation((id: string) => api('PATCH', `/envelopes/${id}`, { archived: false }));
  if (!data) return <Loading error={error} onRetry={refetch} />;

  return (
    <Screen header={<Header caption="Kategoriler" title="Arşiv" onClose={goBack} back />}>
      {data.length === 0 ? (
        <Empty title="Arşiv boş" text="Arşivlediğin kategoriler burada durur; geçmiş harcamaları silinmez." />
      ) : (
        <>
          <T muted>Arşivdeki kategorilerin geçmiş harcamaları korunur. Geri getirdiğinde yeniden kullanabilirsin.</T>
          {data.map((e) => (
            <Card key={e.id}>
              <Row gap={12}>
                <Shape shape={shapeFor(e.id)} color={e.color} size={36} />
                <View style={{ flex: 1 }}>
                  <T v="label">{e.icon} {e.name}</T>
                  <T v="small" muted>{e.kind === 'fixed' ? 'Sabit' : 'Değişken'}</T>
                </View>
                <Button
                  title="Geri getir"
                  kind="secondary"
                  small
                  loading={restore.isPending && restore.variables === e.id}
                  onPress={() => restore.mutate(e.id, { onSuccess: () => toast({ message: `${e.name} geri getirildi` }) })}
                />
              </Row>
            </Card>
          ))}
        </>
      )}
      <ErrorText error={restore.error} />
      {restore.error instanceof ApiError && restore.error.status === 402 && <Button title="Kumbara+'ı incele" kind="secondary" onPress={() => router.push('/plus')} />}
    </Screen>
  );
}
