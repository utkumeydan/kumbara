import BudgetWidget from '@/widgets/BudgetWidget';
import type { Summary } from './api';
import { formatMoney } from './money';

// Özet her güncellendiğinde widget'a yeni rakamlar gönderilir
export function updateWidget(s: Summary) {
  try {
    BudgetWidget.updateSnapshot({
      left: formatMoney(s.left, { cents: false }),
      days: s.cycle?.daysLeft ?? 0,
      perDay: formatMoney(s.perDay, { cents: false }),
      negative: s.left < 0,
      ready: !!s.cycle,
    });
  } catch {
    // Geliştirme sunucusunda (Expo Go) widget modülü yoktur
  }
}
