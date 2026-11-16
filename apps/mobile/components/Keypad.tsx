import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { FONT, useTheme } from '@/lib/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'];

// Ekran klavyesi yerine kullanılan rakam tuş takımı; değer "1250,5" biçiminde tutulur
export function applyKey(value: string, key: string, allowDecimal = true): string {
  if (key === 'del') return value.slice(0, -1);
  if (key === ',') {
    if (!allowDecimal || value.includes(',')) return value;
    return (value || '0') + ',';
  }
  const [, dec] = value.split(',');
  if (dec !== undefined && dec.length >= 2) return value;
  if (value === '0') return key;
  if (value.replace(',', '').length >= 10) return value;
  return value + key;
}

const KEY_LABELS: Record<string, string> = { del: 'Sil', ',': 'Virgül' };

// Web'de bilgisayar klavyesiyle de yazılabilir (rakamlar, virgül/nokta, geri sil, Enter)
export function Keypad({ onKey, onSubmit, allowDecimal = true, keyHeight = 56 }: { onKey: (k: string) => void; onSubmit?: () => void; allowDecimal?: boolean; keyHeight?: number }) {
  const c = useTheme();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) onKey(e.key);
      else if ((e.key === ',' || e.key === '.') && allowDecimal) onKey(',');
      else if (e.key === 'Backspace') onKey('del');
      else if (e.key === 'Enter' && onSubmit) onSubmit();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey, onSubmit, allowDecimal]);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {KEYS.map((k) => (
        <Pressable
          key={k}
          onPress={() => onKey(k)}
          disabled={k === ',' && !allowDecimal}
          accessibilityRole="keyboardkey"
          accessibilityLabel={KEY_LABELS[k] ?? k}
          style={({ pressed }) => ({ width: '33.33%', height: keyHeight, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: pressed ? c.cardAlt : 'transparent' })}>
          {k === 'del' ? (
            <Ionicons name="backspace-outline" size={24} color={c.text} />
          ) : (
            <Text style={{ color: k === ',' && !allowDecimal ? 'transparent' : c.text, fontSize: keyHeight < 48 ? 22 : 26, fontFamily: FONT.medium }}>{k}</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

// Tuş takımı değerini kuruşa çevirir
export function keypadToKurus(value: string) {
  if (!value) return 0;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function kurusToKeypad(k: number) {
  if (!k) return '';
  const whole = Math.floor(k / 100);
  const frac = k % 100;
  return frac ? `${whole},${String(frac).padStart(2, '0').replace(/0$/, '')}` : String(whole);
}

// Gösterim: binlik ayraçlı, girilen ondalık korunur
export function formatKeypad(value: string) {
  if (!value) return '0';
  const [w, d] = value.split(',');
  const whole = Number(w || '0').toLocaleString('tr-TR');
  return d !== undefined ? `${whole},${d}` : whole;
}
