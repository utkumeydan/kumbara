import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

// RevenueCat: satın alma mağazada yapılır, sunucu webhook ile planı günceller.
// Anahtarlar tanımlı değilse (geliştirme) satın alma kapalıdır.
export type PlanOption = { id: string; title: string; price: string; period: string; badge?: string; pkg?: PurchasesPackage };

const KEY = Platform.select({ ios: process.env.EXPO_PUBLIC_RC_IOS_KEY, android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY });
export const purchasesAvailable = !!KEY;
let configured = false;

export async function initPurchases(userId: string) {
  if (!KEY) return;
  if (!configured) {
    Purchases.configure({ apiKey: KEY, appUserID: userId });
    configured = true;
  } else {
    await Purchases.logIn(userId);
  }
}

const PERIOD: Record<string, string> = { WEEKLY: 'haftada bir', MONTHLY: 'ayda bir', ANNUAL: 'yılda bir' };
const TITLE: Record<string, string> = { WEEKLY: 'Haftalık', MONTHLY: 'Aylık', ANNUAL: 'Yıllık' };

export async function getPlans(): Promise<PlanOption[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  return (offerings.current?.availablePackages ?? []).map((p) => ({
    id: p.identifier,
    title: TITLE[p.packageType] ?? p.product.title,
    price: p.product.priceString,
    period: PERIOD[p.packageType] ?? '',
    badge: p.packageType === 'ANNUAL' ? 'En avantajlı' : undefined,
    pkg: p,
  }));
}

export async function buy(plan: PlanOption): Promise<boolean> {
  if (!plan.pkg) return false;
  try {
    const r = await Purchases.purchasePackage(plan.pkg);
    return Object.keys(r.customerInfo.entitlements.active).length > 0;
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

export async function restore(): Promise<boolean> {
  if (!configured) return false;
  const info = await Purchases.restorePurchases();
  return Object.keys(info.entitlements.active).length > 0;
}
