// Web sürümü: mağaza satın alımı yok. Abonelik mobil uygulamadan yapılır.
export type PlanOption = { id: string; title: string; price: string; period: string; badge?: string; pkg?: unknown };

export const purchasesAvailable = false;

export async function initPurchases(_userId: string) {}

export async function getPlans(): Promise<PlanOption[]> {
  return [];
}

export async function buy(_plan: PlanOption): Promise<boolean> {
  return false;
}

export async function restore(): Promise<boolean> {
  return false;
}
