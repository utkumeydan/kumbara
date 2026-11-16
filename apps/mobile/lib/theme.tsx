import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';

// Kumbara kimliği: mürekkep zemin, kâğıt yazı, limon vurgusu. Para için yeşil/kırmızı yalnızca anlam taşır.
const dark = {
  scheme: 'dark' as 'dark' | 'light',
  bg: '#0C0D0F',
  glow: '#161B0C',
  card: '#15171A',
  cardAlt: '#1E2024',
  text: '#F3F0E8',
  muted: '#9C998F',
  faint: '#5A5852',
  border: '#24262B',
  primary: '#D4F36A',
  primaryText: '#11140A',
  // Vurgu rengi zeminde yazı olarak kullanılırken (bağlantı, seçili durum)
  accent: '#D4F36A',
  inverse: '#F3F0E8',
  inverseText: '#0C0D0F',
  danger: '#FF6B5E',
  success: '#6FE3A5',
  onPastel: '#16161A',
  // Yüzeyler: yarı saydam ama okunaklı
  glass: 'rgba(255,255,255,0.045)',
  glassStrong: 'rgba(17,18,21,0.92)',
  glassBorder: 'rgba(255,255,255,0.08)',
  blurTint: 'dark' as 'dark' | 'light',
};

const light: typeof dark = {
  scheme: 'light',
  bg: '#F2F0EA',
  glow: '#E9F3C4',
  card: '#FFFFFF',
  cardAlt: '#E9E6DE',
  text: '#14161A',
  muted: '#65625A',
  faint: '#ADA99F',
  border: '#E2DED4',
  primary: '#CDEF5A',
  primaryText: '#11140A',
  accent: '#4D7A12',
  inverse: '#14161A',
  inverseText: '#F3F0E8',
  danger: '#D63F33',
  success: '#23885A',
  onPastel: '#16161A',
  glass: 'rgba(255,255,255,0.78)',
  glassStrong: 'rgba(250,249,245,0.94)',
  glassBorder: 'rgba(20,22,26,0.07)',
  blurTint: 'light',
};

// Başlık ve tutarlar için karakterli yazı tipi; yüklenmezse sistem yazı tipine düşer
export const FONT = {
  display: 'BricolageGrotesque_800ExtraBold',
  bold: 'BricolageGrotesque_700Bold',
  medium: 'BricolageGrotesque_600SemiBold',
};

export type Theme = typeof dark;
export type ThemePref = 'system' | 'light' | 'dark';

const ThemeContext = createContext<{ pref: ThemePref; setPref: (p: ThemePref) => void }>({ pref: 'dark', setPref: () => {} });

// Varsayılan koyu tema; kullanıcı Ayarlar > Görünüm'den değiştirebilir
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('dark');
  useEffect(() => {
    AsyncStorage.getItem('themePref')
      .then((v) => v && setPrefState(v as ThemePref))
      .catch(() => {});
  }, []);
  const setPref = (p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem('themePref', p).catch(() => {});
  };
  return <ThemeContext.Provider value={{ pref, setPref }}>{children}</ThemeContext.Provider>;
}

export const useThemePref = () => useContext(ThemeContext);

export function useTheme(): Theme {
  const { pref } = useContext(ThemeContext);
  const system = useSystemScheme();
  const scheme = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  return scheme === 'light' ? light : dark;
}

// Zarf renkleri: pastel tonlar, üzerinde koyu yazı
export const PALETTE = ['#C7B8F5', '#A8E6A1', '#F8D66D', '#A7D3F2', '#F7B49A', '#F4A7C4', '#8FD9CF', '#E3C9A8'];

export const ENVELOPE_ICONS = ['🏠', '🛒', '🍔', '☕', '🚗', '💡', '📱', '🎉', '👕', '💊', '🎁', '✈️', '📚', '🐶', '💄', '🏋️', '🎮', '💰'];
export const GOAL_ICONS = ['🎯', '✈️', '🏖️', '🚗', '🏠', '💍', '🎓', '💻', '📱', '🛟', '🎁', '🐢'];

export const PRESET_ENVELOPES = [
  { name: 'Kira', icon: '🏠', color: '#C7B8F5', kind: 'fixed' as const },
  { name: 'Market', icon: '🛒', color: '#A8E6A1', kind: 'variable' as const },
  { name: 'Yeme içme', icon: '🍔', color: '#F8D66D', kind: 'variable' as const },
  { name: 'Faturalar', icon: '💡', color: '#A7D3F2', kind: 'fixed' as const },
  { name: 'Ulaşım', icon: '🚗', color: '#F7B49A', kind: 'variable' as const },
  { name: 'Eğlence', icon: '🎉', color: '#F4A7C4', kind: 'variable' as const },
  { name: 'Sağlık', icon: '💊', color: '#8FD9CF', kind: 'variable' as const },
  { name: 'Alışveriş', icon: '👕', color: '#E3C9A8', kind: 'variable' as const },
];
