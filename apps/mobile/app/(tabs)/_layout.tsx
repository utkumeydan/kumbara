import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { useEffect, type ComponentProps } from 'react';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Turtle';
import type { IconName } from '@/components/ui';
import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import { useSummary, useTransactions } from '@/lib/api';
import { syncLiveActivity, useLiveActivityPref } from '@/lib/liveActivity';
import { registerPush, usePushNavigation } from '@/lib/push';
import { useAuth } from '@/lib/auth';
import { syncNotifications, useNotifPrefs } from '@/lib/notifications';
import { updateWidget } from '@/lib/widget';
import { useTheme } from '@/lib/theme';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// label ekranda görünen kısa ad, name ekran okuyucunun okuduğu tam ad
const TABS: Record<string, { label: string; name?: string; icon: IconName; iconOn: IconName }> = {
  index: { label: 'Özet', name: 'Ana sayfa', icon: 'home-outline', iconOn: 'home' },
  envelopes: { label: 'Harcama', name: 'Harcamalar', icon: 'pie-chart-outline', iconOn: 'pie-chart' },
  payments: { label: 'Ödemeler', icon: 'calendar-outline', iconOn: 'calendar' },
  accounts: { label: 'Hesaplar', icon: 'wallet-outline', iconOn: 'wallet' },
  menu: { label: 'Menü', icon: 'grid-outline', iconOn: 'grid' },
};

// Ekranın altına yaslanan sekme çubuğu; ortada hızlı harcama ekleme düğmesi
function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const routes = state.routes.map((route, i) => ({ route, i, meta: TABS[route.name] })).filter((x) => x.meta);
  const tab = ({ route, i, meta }: (typeof routes)[number]) => {
    const on = state.index === i;
    return (
      <Pressable
        key={route.key}
        onPress={() => !on && navigateToTab(route.key)}
        accessibilityRole="tab"
        accessibilityLabel={meta.name ?? meta.label}
        accessibilityState={{ selected: on }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 8, paddingBottom: 6, gap: 3 }}>
        <View style={{ height: 30, minWidth: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.cardAlt : 'transparent' }}>
          {route.name === 'menu' ? (
            <Avatar index={user?.avatar ?? 0} size={24} />
          ) : (
            <Ionicons name={on ? meta.iconOn : meta.icon} size={21} color={on ? c.text : c.muted} />
          )}
        </View>
        <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: on ? '800' : '600', color: on ? c.text : c.muted }}>{meta.label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.glassStrong, borderTopWidth: 1, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 6) }}>
      <BlurView intensity={40} tint={c.blurTint} style={StyleSheet.absoluteFill} />
      <View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: 560, width: '100%', alignSelf: 'center', paddingHorizontal: 4 }}>
        {routes.slice(0, 2).map(tab)}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Pressable
            onPress={() => router.push('/add')}
            accessibilityRole="button"
            accessibilityLabel="Harcama ekle"
            style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 20, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginTop: -18, transform: [{ scale: pressed ? 0.94 : 1 }], shadowColor: c.primary, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 })}>
            <Ionicons name="add" size={32} color={c.primaryText} />
          </Pressable>
        </View>
        {routes.slice(2).map(tab)}
      </View>
    </View>
  );
}

// Özet ya da bildirim tercihleri değişince yerel bildirim planı yeniden kurulur
function NotificationSync() {
  const { data, dataUpdatedAt } = useSummary();
  const { data: todayTxs } = useTransactions({ from: data?.cycle?.today, to: data?.cycle?.today });
  const prefs = useNotifPrefs();
  const live = useLiveActivityPref();
  usePushNavigation();
  useEffect(() => {
    registerPush().catch(() => {});
  }, [prefs.enabled]);
  useEffect(() => {
    if (data) {
      syncNotifications(data).catch(() => {});
      updateWidget(data);
      syncLiveActivity(data, todayTxs, live);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt, prefs, live, todayTxs]);
  return null;
}

// Ana ekran simgesine uzun basınca çıkan kısayollar
function QuickActionsSetup() {
  useQuickActionRouting();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    QuickActions.setItems([
      { id: 'add', title: 'Harcama ekle', icon: Platform.OS === 'ios' ? 'add' : undefined, params: { href: '/add' } },
      { id: 'spending', title: 'Harcamalar', icon: Platform.OS === 'ios' ? 'symbol:chart.pie' : undefined, params: { href: '/envelopes' } },
      { id: 'payments', title: 'Ödemeler', icon: Platform.OS === 'ios' ? 'date' : undefined, params: { href: '/payments' } },
    ]).catch(() => {});
  }, []);
  return null;
}

export default function TabLayout() {
  const c = useTheme();
  return (
    <>
    <NotificationSync />
    <QuickActionsSetup />
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="envelopes" />
      <Tabs.Screen name="payments" />
      <Tabs.Screen name="accounts" />
      <Tabs.Screen name="menu" />
      {/* Analiz menüden açılır */}
      <Tabs.Screen name="analysis" options={{ href: null }} />
    </Tabs>
    </>
  );
}
