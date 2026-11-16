import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from '@/components/Glass';
import { useTheme } from '@/lib/theme';

type Toast = { message: string; action?: { label: string; onPress: () => void } };
const ToastContext = createContext<(t: Toast) => void>(() => {});

// Ekranın altında kısa bildirim; isteğe bağlı "Geri al" gibi bir eylem içerir
export function ToastProvider({ children }: { children: ReactNode }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((t: Toast) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(t);
    timer.current = setTimeout(() => setToast(null), Math.max(t.action ? 6000 : 3500, t.message.length * 60));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 92, alignItems: 'center', paddingHorizontal: 16 }}>
          <Glass
            strong
            intensity={70}
            radius={18}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 18, maxWidth: 520, width: '100%' }}>
            <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ color: c.text, flex: 1, fontWeight: '600', fontSize: 14 }}>
              {toast.message}
            </Text>
            {toast.action && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  toast.action!.onPress();
                  setToast(null);
                }}
                hitSlop={10}>
                <Text style={{ color: c.accent, fontWeight: '800', fontSize: 14 }}>{toast.action.label}</Text>
              </Pressable>
            )}
          </Glass>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
