import { useState } from 'react';
import { BlurView } from 'expo-blur';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Glass } from '@/components/Glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { applyKey, formatKeypad, Keypad, keypadToKurus, kurusToKeypad } from '@/components/Keypad';
import { Button } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { FONT, useTheme } from '@/lib/theme';

// Alttan açılan tutar girişi; max verilirse aşan tutar kabul edilmez
export function AmountSheet({
  open,
  title,
  initial,
  max,
  onClose,
  onDone,
}: {
  open: boolean;
  title: string;
  initial: number;
  max?: number;
  onClose: () => void;
  onDone: (kurus: number) => void;
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {open ? <SheetBody title={title} initial={initial} max={max} onClose={onClose} onDone={onDone} /> : null}
    </Modal>
  );
}

// Her açılışta yeniden oluşur, böylece başlangıç değeri doğrudan state'e girer
function SheetBody({ title, initial, max, onClose, onDone }: { title: string; initial: number; max?: number; onClose: () => void; onDone: (kurus: number) => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(() => kurusToKeypad(initial));
  const k = keypadToKurus(value);
  const over = max !== undefined && k > max;

  return (
    <>
      {/* Arkadaki ekran Gaussian bulanıklıkla geri çekilir */}
      <BlurView intensity={25} tint={c.blurTint} style={StyleSheet.absoluteFill} />
      <Pressable style={{ flex: 1, backgroundColor: '#0005' }} onPress={onClose} accessibilityLabel="Kapat" />
      <Glass
        strong
        intensity={70}
        radius={30}
        style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 20, paddingBottom: insets.bottom + 16, gap: 10, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        <Text style={{ color: c.text, fontWeight: '800', fontSize: 15, textAlign: 'center' }}>{title}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' }}>
          <Text style={{ color: c.muted, fontSize: 30, fontFamily: FONT.display, marginTop: 8 }}>₺</Text>
          <Text style={{ color: c.text, fontSize: 60, fontFamily: FONT.display, letterSpacing: -2 }}>{formatKeypad(value)}</Text>
        </View>
        {max !== undefined && (
          <Text style={{ textAlign: 'center', fontSize: 12.5, color: over ? c.danger : c.muted }}>
            {over
              ? `En fazla ${formatMoney(max, { cents: false })} girebilirsin.`
              : `Buraya en fazla ${formatMoney(max, { cents: false })} koyabilirsin`}
          </Text>
        )}
        <Keypad onKey={(key) => setValue((v) => applyKey(v, key, false))} onSubmit={() => !over && onDone(k)} allowDecimal={false} />
        <Button title="Tamam" icon="checkmark" disabled={over} onPress={() => onDone(k)} />
      </Glass>
    </>
  );
}
