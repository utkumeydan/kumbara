import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import DailyActivity from '@/widgets/DailyActivity';
import type { Summary, Transaction } from './api';
import { formatMoney } from './money';

const KEY = 'liveActivity';
export const liveActivitySupported = Platform.OS === 'ios';
const listeners = new Set<(v: boolean) => void>();

export function useLiveActivityPref() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setOn(v === '1'))
      .catch(() => {});
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return on;
}

export async function setLiveActivityPref(on: boolean) {
  await AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
  listeners.forEach((l) => l(on));
}

// Açıksa kilit ekranındaki günlük pay etkinliğini başlatır ya da günceller; kapalıysa bitirir
export async function syncLiveActivity(s: Summary, todayTxs: Transaction[] | undefined, enabled: boolean) {
  if (!liveActivitySupported) return;
  try {
    const running = DailyActivity.getInstances();
    if (!enabled || !s.cycle) {
      await Promise.all(running.map((a) => a.end()));
      return;
    }
    const spentToday = (todayTxs ?? []).reduce((sum, x) => sum + x.amount, 0);
    const props = {
      today: formatMoney(Math.max(0, s.perDay - spentToday), { cents: false }),
      left: formatMoney(s.left, { cents: false }),
      days: s.cycle.daysLeft,
      spentToday: formatMoney(spentToday, { cents: false }),
    };
    if (running.length) await running[0].update(props);
    else DailyActivity.start(props);
  } catch {
    // Expo Go'da ya da Canlı Etkinlikler kapalıysa sessizce geçilir
  }
}
