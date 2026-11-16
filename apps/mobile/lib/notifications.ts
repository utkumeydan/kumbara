import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Summary } from './api';
import { formatMoney } from './money';

// Yerel bildirimler: fatura hatırlatma (bir gün önce), seriyi koruma (akşam), maaş günü.
// Sunucu gerekmez; özet her güncellendiğinde plan yeniden kurulur.

export type NotifPrefs = { enabled: boolean; bills: boolean; streak: boolean; payday: boolean };
const KEY = 'notifPrefs';
const DEFAULT: NotifPrefs = { enabled: false, bills: true, streak: true, payday: true };
export const notificationsSupported = Platform.OS !== 'web';

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function getPrefs(): Promise<NotifPrefs> {
  try {
    return { ...DEFAULT, ...JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') };
  } catch {
    return DEFAULT;
  }
}

const listeners = new Set<(p: NotifPrefs) => void>();

export async function setPrefs(p: NotifPrefs) {
  await AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => {});
  listeners.forEach((l) => l(p));
}

export function useNotifPrefs() {
  const [p, setP] = useState<NotifPrefs>(DEFAULT);
  useEffect(() => {
    getPrefs().then(setP);
    listeners.add(setP);
    return () => {
      listeners.delete(setP);
    };
  }, []);
  return p;
}

// İzin ister; verilirse bildirimleri açar
export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported) return false;
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (granted && Platform.OS === 'android') {
    // eslint-disable-next-line import/namespace -- enum, tip dosyasından yeniden dışa aktarılıyor
    await Notifications.setNotificationChannelAsync('default', { name: 'Hatırlatmalar', importance: Notifications.AndroidImportance.DEFAULT });
  }
  await setPrefs({ ...(await getPrefs()), enabled: granted });
  return granted;
}

function at(day: string, hour: number, minute = 0) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute);
}

function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export async function syncNotifications(s: Summary) {
  if (!notificationsSupported) return;
  const prefs = await getPrefs();
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!prefs.enabled || !s.cycle) return;
  const now = Date.now();
  const jobs: { date: Date; title: string; body: string }[] = [];

  if (prefs.bills) {
    const due = [
      ...s.billsDue.filter((b) => b.dueDate).map((b) => ({ name: b.name, amount: b.amount, date: b.dueDate! })),
      ...s.fixedDue.map((f) => ({ name: f.name, amount: f.amount, date: f.dueDate })),
      ...s.debtsDue.map((d) => ({ name: d.name, amount: d.amount, date: d.dueDate })),
    ];
    for (const b of due) jobs.push({ date: at(addDays(b.date, -1), 10), title: 'Yarın ödeme var', body: `${b.name}: ${formatMoney(b.amount, { cents: false })}` });
  }
  if (prefs.payday) {
    jobs.push({ date: at(s.cycle.nextPayday, 9), title: 'Maaş günü! 💸', body: 'Bu ayın ödemelerine ve harcamalarına göz at.' });
  }
  if (prefs.streak) {
    // Önümüzdeki 7 akşam; bugün kayıt varsa bugünkü atlanır
    const todayActive = s.week.find((d) => d.today)?.active;
    for (let i = todayActive ? 1 : 0; i < 7; i++) {
      jobs.push({
        date: at(addDays(s.cycle.today, i), 20, 30),
        title: s.streak > 0 ? `${s.streak} günlük serin var 🔥` : 'Bugün ne harcadın?',
        body: 'Bir harcama kaydet, kaplumbağan büyümeye devam etsin.',
      });
    }
  }

  for (const j of jobs.filter((x) => x.date.getTime() > now)) {
    await Notifications.scheduleNotificationAsync({
      content: { title: j.title, body: j.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: j.date, channelId: Platform.OS === 'android' ? 'default' : undefined },
    });
  }
}
