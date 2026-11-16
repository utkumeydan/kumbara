import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { Avatar } from '@/components/Turtle';
import { useToast } from '@/components/Toast';
import { Button, Card, ErrorText, Field, Header, Loading, Row, Screen, T } from '@/components/ui';
import { api, ApiError, useApiMutation, useSpaces, type Space } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/nav';
import { FONT, useTheme } from '@/lib/theme';

// Birlikte: partnerle ya da ev arkadaşlarıyla ortak zarf seti. Kişisel bütçe, maaş ve seri paylaşılmaz.
export default function Together() {
  const c = useTheme();
  const toast = useToast();
  const { user, space, setSpace } = useAuth();
  const { data, error, refetch } = useSpaces();
  const [mode, setMode] = useState<'list' | 'create' | 'join'>('list');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<{ spaceId: string; code: string } | null>(null);

  const create = useApiMutation((n: string) => api<{ id: string }>('POST', '/spaces', { name: n }));
  const join = useApiMutation((k: string) => api<{ id: string; name: string }>('POST', '/spaces/join', { code: k }));
  const makeInvite = useApiMutation((id: string) => api<{ code: string }>('POST', `/spaces/${id}/invites`));
  const leave = useApiMutation((id: string) => api('DELETE', `/spaces/${id}/members/${user!.id}`));

  if (!data) return <Loading error={error} onRetry={refetch} />;

  async function open(id: string | null) {
    await setSpace(id);
    router.replace('/');
  }

  if (mode === 'create') {
    return (
      <Screen header={<Header title="Alan oluştur" onClose={() => setMode('list')} back />}>
        <Field label="Alanın adı" value={name} onChangeText={setName} placeholder="Ör. Ev, Biz, Tatil" maxLength={40} />
        <T v="small" muted>Alanı açtıktan sonra bir davet kodu oluşturup partnerine gönderebilirsin.</T>
        <ErrorText error={create.error} />
        {create.error instanceof ApiError && create.error.status === 402 && <Button title="Kumbara+'ı incele" kind="secondary" onPress={() => router.push('/plus')} />}
        <Button
          title="Alanı oluştur"
          disabled={!name.trim()}
          loading={create.isPending}
          onPress={() =>
            create.mutate(name.trim(), {
              onSuccess: async (s) => {
                setMode('list');
                setName('');
                const inv = await api<{ code: string }>('POST', `/spaces/${s.id}/invites`).catch(() => null);
                if (inv) setInvite({ spaceId: s.id, code: inv.code });
              },
            })
          }
        />
      </Screen>
    );
  }

  if (mode === 'join') {
    return (
      <Screen header={<Header title="Kodum var" onClose={() => setMode('list')} back />}>
        <Field
          label="Davet kodu"
          value={code}
          onChangeText={(s) => setCode(s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="ABC123"
          autoCapitalize="characters"
          style={{ fontSize: 26, letterSpacing: 6, fontWeight: '800', textAlign: 'center' }}
        />
        <ErrorText error={join.error} />
        <Button
          title="Katıl"
          disabled={code.length !== 6}
          loading={join.isPending}
          onPress={() =>
            join.mutate(code, {
              onSuccess: async (s) => {
                toast({ message: `${s.name} alanına katıldın` });
                await open(s.id);
              },
            })
          }
        />
      </Screen>
    );
  }

  return (
    <Screen header={<Header title="Birlikte" onClose={goBack} back />}>
      {data.length === 0 && (
        <View style={{ gap: 12, marginTop: 10 }}>
          <View style={{ height: 180, justifyContent: 'center' }}>
            <View style={{ backgroundColor: '#A8E6A1', borderRadius: 26, padding: 20, width: '72%', transform: [{ rotate: '-6deg' }] }}>
              <Text style={{ fontWeight: '800', color: c.onPastel }}>🛒 Market</Text>
            </View>
            <View style={{ backgroundColor: '#C7B8F5', borderRadius: 26, padding: 20, width: '72%', alignSelf: 'flex-end', marginTop: -6, transform: [{ rotate: '4deg' }] }}>
              <Text style={{ fontWeight: '800', color: c.onPastel }}>🏠 Kira</Text>
            </View>
          </View>
          <Text style={{ fontSize: 30, fontFamily: FONT.display, letterSpacing: -1, color: c.text }}>
            Birlikte <Text style={{ color: c.muted }}>bütçe yapın</Text>
          </Text>
          <T muted>İkinizin de harcamalarını girdiği ortak bir hesap. Kendi hesabın sana ait ve özel kalır.</T>
          <Row gap={8}>
            <Ionicons name="lock-closed-outline" size={14} color={c.muted} />
            <T v="small" muted>Kendi kategorilerin, hesapların ve serin asla paylaşılmaz.</T>
          </Row>
        </View>
      )}

      <T v="tiny" muted style={{ marginTop: 6 }}>Hangi bütçeyi görüyorsun?</T>
      <Choice title="Kişisel bütçem" subtitle="Yalnızca sen görürsün" active={!space} onPress={() => open(null)} />
      {data.map((s) => (
        <SpaceCard
          key={s.id}
          s={s}
          active={space === s.id}
          code={invite?.spaceId === s.id ? invite.code : undefined}
          onOpen={() => open(s.id)}
          onInvite={() => makeInvite.mutate(s.id, { onSuccess: (r) => setInvite({ spaceId: s.id, code: r.code }) })}
          onLeave={async () => {
            if (!(await confirm(`${s.name} alanından ayrılınsın mı?`, s.members.length === 1 ? 'Son üye sensin; alan ve içindeki veriler silinir.' : 'Alan diğer üyeler için devam eder.', 'Ayrıl'))) return;
            leave.mutate(s.id, {
              onSuccess: async () => {
                if (space === s.id) await setSpace(null);
                toast({ message: `${s.name} alanından ayrıldın` });
              },
            });
          }}
        />
      ))}
      {space && (
        <Button title="Hesaplaşma: kim kime borçlu?" icon="swap-horizontal" kind="secondary" onPress={() => router.push('/settle')} />
      )}
      <ErrorText error={makeInvite.error ?? leave.error} />

      <Button title="Alan oluştur" icon="add" onPress={() => setMode('create')} style={{ marginTop: 8 }} />
      <Button title="Kodum var" kind="secondary" onPress={() => setMode('join')} />
    </Screen>
  );
}

function Choice({ title, subtitle, active, onPress }: { title: string; subtitle: string; active: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Card onPress={onPress} style={active ? { borderWidth: 2, borderColor: c.text } : undefined}>
      <Row gap={12}>
        <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? c.text : c.faint} />
        <View style={{ flex: 1 }}>
          <T v="label">{title}</T>
          <T v="small" muted>{subtitle}</T>
        </View>
      </Row>
    </Card>
  );
}

function SpaceCard({ s, active, code, onOpen, onInvite, onLeave }: { s: Space; active: boolean; code?: string; onOpen: () => void; onInvite: () => void; onLeave: () => void }) {
  const c = useTheme();
  return (
    <Card style={[{ gap: 12 }, active ? { borderWidth: 2, borderColor: c.text } : null]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${s.name} alanını aç`}>
        <Row gap={12}>
          <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? c.text : c.faint} />
          <View style={{ flex: 1 }}>
            <T v="label">👥 {s.name}</T>
            <T v="small" muted>{s.members.map((m) => m.name).join(', ')}</T>
          </View>
          <Row gap={-8}>
            {s.members.slice(0, 3).map((m) => (
              <Avatar key={m.userId} index={m.avatar} size={28} />
            ))}
          </Row>
        </Row>
      </Pressable>
      {code ? (
        <View style={{ backgroundColor: c.cardAlt, borderRadius: 16, padding: 14, gap: 8, alignItems: 'center' }}>
          <T v="tiny" muted>Davet kodu · 7 gün geçerli</T>
          <Text selectable style={{ color: c.text, fontSize: 30, fontFamily: FONT.display, letterSpacing: 8 }}>{code}</Text>
          <Button
            title="Paylaş"
            icon="share-outline"
            small
            kind="secondary"
            onPress={() => Share.share({ message: `Kumbara'da "${s.name}" ortak bütçemize katıl: Menü > Birlikte > Kodum var > ${code}` })}
          />
        </View>
      ) : (
        <Row>
          <Button title="Davet kodu" small kind="secondary" style={{ flex: 1 }} onPress={onInvite} />
          <Button title="Ayrıl" small kind="ghost" onPress={onLeave} />
        </Row>
      )}
    </Card>
  );
}
