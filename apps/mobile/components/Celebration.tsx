import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Glass } from '@/components/Glass';
import { TurtleFace } from '@/components/Turtle';
import { Button, T } from '@/components/ui';
import { FONT, useTheme } from '@/lib/theme';

const COLORS = ['#FF6B57', '#F8D66D', '#A8E6A1', '#C7B8F5', '#A7D3F2', '#F4A7C4'];

// Sabit tohumlu sözde rastgele sayı (0..1); her parçaya farklı ama tekrarlanabilir değerler verir
function noise(i: number, k: number) {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function makePieces(width: number) {
  return Array.from({ length: 60 }, (_, i) => ({
    x: noise(i, 1) * width,
    size: 6 + noise(i, 2) * 8,
    color: COLORS[i % COLORS.length],
    delay: noise(i, 3) * 600,
    duration: 1800 + noise(i, 4) * 1400,
    drift: (noise(i, 5) - 0.5) * 120,
    spin: (noise(i, 6) > 0.5 ? 1 : -1) * (180 + noise(i, 7) * 540),
    round: noise(i, 8) > 0.6,
  }));
}

// Hedef tamamlanınca: yukarıdan dökülen konfeti ve taçlı kaplumbağa
export function Celebration({ open, title, text, onClose }: { open: boolean; title: string; text: string; onClose: () => void }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {open ? <Body title={title} text={text} onClose={onClose} /> : null}
    </Modal>
  );
}

function Body({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const c = useTheme();
  const { width, height } = useWindowDimensions();
  // Konfeti parçaları ve animasyon değerleri bir kez oluşturulur
  const [pieces] = useState(() => makePieces(width));
  const [progress] = useState(() => pieces.map(() => new Animated.Value(0)));
  const [pop] = useState(() => new Animated.Value(0.6));

  useEffect(() => {
    Animated.parallel([
      ...progress.map((v, i) => Animated.timing(v, { toValue: 1, duration: pieces[i].duration, delay: pieces[i].delay, easing: Easing.in(Easing.quad), useNativeDriver: true })),
      Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [progress, pieces, pop]);

  return (
    <Pressable style={{ flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 24 }} onPress={onClose} accessibilityLabel="Kapat">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -20,
            left: p.x,
            width: p.size,
            height: p.round ? p.size : p.size * 1.6,
            borderRadius: p.round ? p.size / 2 : 2,
            backgroundColor: p.color,
            transform: [
              { translateY: progress[i].interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
              { translateX: progress[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: progress[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
            ],
          }}
        />
      ))}
      <Animated.View style={{ transform: [{ scale: pop }], width: '100%', maxWidth: 380 }}>
        <Glass strong intensity={70} radius={30} style={{ padding: 24, alignItems: 'center', gap: 10 }}>
          <TurtleFace size={140} stage={4} mood="happy" />
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 26, fontFamily: FONT.display, textAlign: 'center' }}>{title}</Text>
          <T muted style={{ textAlign: 'center' }}>{text}</T>
          <View style={{ height: 6 }} />
          <Button title="Harika!" onPress={onClose} style={{ alignSelf: 'stretch' }} />
        </Glass>
      </Animated.View>
    </Pressable>
  );
}
