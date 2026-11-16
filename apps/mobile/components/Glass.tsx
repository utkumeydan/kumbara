import { BlurView } from 'expo-blur';
import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

// Buzlu cam yüzeyi: arkasındakini Gaussian bulanıklıkla gösterir, üstüne ince bir renk ve kenarlık koyar.
// Android'de gerçek bulanıklık ayrı bir hedef görünüm gerektirdiği için yarı saydam dolguyla görünür.
export function Glass({
  children,
  style,
  intensity = 40,
  radius = 22,
  strong,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  radius?: number;
  strong?: boolean;
}) {
  const c = useTheme();
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: c.glassBorder }, style]}>
      <BlurView intensity={intensity} tint={c.blurTint} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: strong ? c.glassStrong : c.glass }]} />
      {children}
    </View>
  );
}

// Kenarlara doğru tamamen saydamlaşan yumuşak ışıma (Gaussian bulanıklığa benzer)
export function SoftGlow({ color, size, opacity = 0.7, style }: { color: string; size: number; opacity?: number; style?: StyleProp<ViewStyle> }) {
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.45" stopColor={color} stopOpacity={opacity * 0.45} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
