import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

const STAGES = ['Minik kaplumbağa', 'Meraklı kaplumbağa', 'Mutlu kaplumbağa', 'Bilge kaplumbağa', 'Kral kaplumbağa'];

type Mood = 'happy' | 'calm' | 'sad';

// Çizilmiş kaplumbağa: kabuk, kafa ve ayaklar. stage arttıkça büyür ve aksesuar kazanır
// (para, ışıltı, mücevher, taç).
export function TurtleFace({ size = 64, stage = 0, mood = 'happy', dim }: { size?: number; stage?: number; mood?: Mood; dim?: boolean }) {
  const s = Math.max(0, Math.min(4, stage));
  const scale = 0.86 + s * 0.035;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={dim ? 0.35 : 1}>
      <Defs>
        <RadialGradient id="shell" cx="45%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#9BD98F" />
          <Stop offset="1" stopColor="#4E9F5A" />
        </RadialGradient>
        <RadialGradient id="skin" cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#D8F2C6" />
          <Stop offset="1" stopColor="#9FD38C" />
        </RadialGradient>
      </Defs>
      <G transform={`translate(50 58) scale(${scale}) translate(-50 -58)`}>
        {/* Ayaklar ve kuyruk */}
        <Ellipse cx="18" cy="80" rx="9" ry="6" fill="#8CC97A" />
        <Ellipse cx="82" cy="80" rx="9" ry="6" fill="#8CC97A" />
        <Ellipse cx="16" cy="62" rx="8" ry="5.5" fill="#8CC97A" />
        <Ellipse cx="84" cy="62" rx="8" ry="5.5" fill="#8CC97A" />
        {/* Kabuk */}
        <Ellipse cx="50" cy="68" rx="36" ry="24" fill="url(#shell)" />
        <Ellipse cx="50" cy="86" rx="34" ry="5" fill="#3F8A4B" opacity={0.6} />
        <Path d="M50 56 L60 62 L60 74 L50 80 L40 74 L40 62 Z" fill="#B7E6A6" opacity={0.75} />
        <Path d="M40 62 L28 58 M60 62 L72 58 M40 74 L28 80 M60 74 L72 80 M50 56 L50 46 M50 80 L50 90" stroke="#B7E6A6" strokeWidth={2.5} opacity={0.7} strokeLinecap="round" />
        <Ellipse cx="38" cy="54" rx="12" ry="5" fill="#FFFFFF" opacity={0.22} />
        {/* Kafa */}
        <Circle cx="50" cy="34" r="22" fill="url(#skin)" />
        <Ellipse cx="44" cy="24" rx="9" ry="5" fill="#FFFFFF" opacity={0.35} />
        {/* Yanaklar */}
        <Ellipse cx="34" cy="41" rx="5" ry="3.2" fill="#FF9AA8" opacity={0.55} />
        <Ellipse cx="66" cy="41" rx="5" ry="3.2" fill="#FF9AA8" opacity={0.55} />
        {/* Gözler */}
        {mood === 'sad' ? (
          <>
            <Path d="M36 33 Q41 37 46 33" stroke="#1F2A1C" strokeWidth={2.6} fill="none" strokeLinecap="round" />
            <Path d="M54 33 Q59 37 64 33" stroke="#1F2A1C" strokeWidth={2.6} fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <Circle cx="41" cy="32" r="5" fill="#1F2A1C" />
            <Circle cx="59" cy="32" r="5" fill="#1F2A1C" />
            <Circle cx="42.8" cy="30.2" r="1.7" fill="#FFFFFF" />
            <Circle cx="60.8" cy="30.2" r="1.7" fill="#FFFFFF" />
          </>
        )}
        {/* Ağız */}
        {mood === 'happy' && <Path d="M44 44 Q50 49 56 44" stroke="#3E6B35" strokeWidth={2.4} fill="none" strokeLinecap="round" />}
        {mood === 'calm' && <Path d="M46 45 L54 45" stroke="#3E6B35" strokeWidth={2.4} strokeLinecap="round" />}
        {mood === 'sad' && <Path d="M44 47 Q50 42 56 47" stroke="#3E6B35" strokeWidth={2.4} fill="none" strokeLinecap="round" />}
      </G>

      {s >= 1 && (
        <G>
          <Circle cx="86" cy="84" r="10" fill="#F8D66D" stroke="#D9A92A" strokeWidth={2} />
          <SvgText x="86" y="88" fontSize="11" fontWeight="bold" fill="#8A6510" textAnchor="middle">
            ₺
          </SvgText>
        </G>
      )}
      {s >= 2 && <Path d="M86 14 L88 20 L94 22 L88 24 L86 30 L84 24 L78 22 L84 20 Z" fill="#FFD84D" />}
      {s >= 3 && <Path d="M8 82 L14 75 L20 82 L14 92 Z" fill="#8FD9F5" stroke="#4FB3DA" strokeWidth={1.5} />}
      {s >= 4 && <Path d="M36 12 L40 2 L45 9 L50 0 L55 9 L60 2 L64 12 Z" fill="#FFC93C" stroke="#D99A00" strokeWidth={1.5} />}
    </Svg>
  );
}

// Seviye arttıkça büyüyen kaplumbağa
export function Turtle({ stage, size = 1, locked }: { stage: number; size?: number; locked?: boolean }) {
  const c = useTheme();
  const box = 72 * size;
  return (
    <View
      accessibilityLabel={`${turtleLabel(stage)}${locked ? ', kilitli' : ''}`}
      style={{ width: box, height: box, borderRadius: box / 2, backgroundColor: c.glass, borderWidth: 1, borderColor: c.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
      <TurtleFace size={box * 0.9} stage={stage} dim={locked} />
    </View>
  );
}

export const turtleLabel = (stage: number) => STAGES[Math.max(0, Math.min(4, stage))];

export const AVATAR_COLORS = ['#7FD3F7', '#F7B49A', '#C7B8F5', '#F8D66D', '#F4A7C4', '#8FD9CF'];

// Profil avatarı: renkli kare içinde kaplumbağa
export function Avatar({ index = 0, size = 44 }: { index?: number; size?: number }) {
  return (
    <View
      accessibilityLabel="Profil avatarı"
      style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <TurtleFace size={size * 0.92} />
    </View>
  );
}
