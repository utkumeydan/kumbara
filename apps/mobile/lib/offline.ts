import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { api, ApiError, isOffline, type Summary, type Transaction } from './api';

// Çevrimdışıyken eklenen harcamalar burada sıraya alınır ve bağlantı gelince gönderilir.
// Sunucu clientId ile tekrarları ayıklar, bu yüzden aynı kayıt iki kez gönderilse de bir kez yazılır.

export type PendingTx = { clientId: string; envelopeId: string; amount: number; note: string; spentOn: string; space: string | null; accountId?: string | null };

const KEY = 'pendingTx';
const listeners = new Set<(n: number) => void>();

async function read(): Promise<PendingTx[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
  } catch {
    return [];
  }
}

async function write(items: PendingTx[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items)).catch(() => {});
  listeners.forEach((l) => l(items.length));
}

export function usePendingCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    read().then((x) => setN(x.length));
    listeners.add(setN);
    return () => {
      listeners.delete(setN);
    };
  }, []);
  return n;
}

// Bekleyen kaydı önbellekteki özete yansıtır, böylece kalan tutar hemen güncellenir
function applyOptimistic(qc: QueryClient, item: PendingTx) {
  qc.setQueryData<Summary>(['summary'], (s) => {
    if (!s) return s;
    return {
      ...s,
      left: s.left - item.amount,
      envelopes: s.envelopes.map((e) => (e.id === item.envelopeId ? { ...e, spent: e.spent + item.amount, remaining: e.remaining - item.amount } : e)),
    };
  });
  qc.setQueriesData<Transaction[]>({ queryKey: ['transactions'] }, (list) => {
    if (!list) return list;
    const s = qc.getQueryData<Summary>(['summary']);
    const env = s?.envelopes.find((e) => e.id === item.envelopeId);
    const tx: Transaction = {
      id: item.clientId,
      amount: item.amount,
      note: item.note,
      spentOn: item.spentOn,
      envelopeId: item.envelopeId,
      cycleId: s?.cycle?.id ?? '',
      billId: null,
      debtId: null,
      envelopeName: env?.name ?? '',
      envelopeColor: env?.color ?? '#999',
      envelopeIcon: env?.icon ?? '💰',
      createdBy: null,
      createdByName: null,
      pending: true,
    };
    return [tx, ...list];
  });
}

// Harcama ekler; ağ yoksa kuyruğa alır. Dönüş: kayıt kuyruğa mı alındı?
export async function addExpense(qc: QueryClient, body: Omit<PendingTx, 'clientId'>): Promise<{ queued: boolean; id?: string; alerts: string[] }> {
  const item: PendingTx = { ...body, clientId: Crypto.randomUUID() };
  try {
    const tx = await api<{ id: string; alerts?: string[] }>('POST', '/transactions', { envelopeId: item.envelopeId, amount: item.amount, note: item.note, spentOn: item.spentOn, clientId: item.clientId, accountId: item.accountId ?? null }, { space: item.space });
    return { queued: false, id: tx.id, alerts: tx.alerts ?? [] };
  } catch (e) {
    if (!isOffline(e)) throw e;
    await write([...(await read()), item]);
    applyOptimistic(qc, item);
    return { queued: true, alerts: [] };
  }
}

let flushing = false;

// Kuyruğu sırayla gönderir; ağ yine yoksa durur, sunucu reddederse kaydı bırakır
export async function flushPending(qc: QueryClient): Promise<{ sent: number; failed: string[] }> {
  if (flushing) return { sent: 0, failed: [] };
  if (!(await read()).length) return { sent: 0, failed: [] };
  flushing = true;
  let sent = 0;
  const failed: string[] = [];
  try {
    let items = await read();
    while (items.length) {
      const item = items[0];
      try {
        await api('POST', '/transactions', { envelopeId: item.envelopeId, amount: item.amount, note: item.note, spentOn: item.spentOn, clientId: item.clientId, accountId: item.accountId ?? null }, { space: item.space });
        sent++;
      } catch (e) {
        if (isOffline(e)) break;
        failed.push(e instanceof ApiError ? e.message : 'Gönderilemedi');
      }
      items = items.slice(1);
      await write(items);
    }
    if (sent || failed.length) await qc.invalidateQueries();
  } finally {
    flushing = false;
  }
  return { sent, failed };
}
