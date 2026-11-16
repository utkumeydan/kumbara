import Svg, { Path, Rect } from 'react-native-svg';

const SHAPES = ['diamond', 'square', 'dome', 'pill', 'circle'] as const;
export type ShapeName = (typeof SHAPES)[number];

// Zarf kimliğinden kararlı bir şekil seçer
export function shapeFor(id: string): ShapeName {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SHAPES[h % SHAPES.length];
}

export function Shape({ shape, color, size = 40 }: { shape: ShapeName; color: string; size?: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 40 40">
      {shape === 'diamond' && <Rect x="8" y="8" width="24" height="24" rx="5" fill={color} transform="rotate(45 20 20)" />}
      {shape === 'square' && <Rect x="3" y="3" width="34" height="34" rx="10" fill={color} />}
      {shape === 'dome' && <Path d="M4 38 V20 A16 16 0 0 1 36 20 V38 Z" fill={color} />}
      {shape === 'pill' && <Rect x="11" y="2" width="18" height="36" rx="9" fill={color} />}
      {shape === 'circle' && <Rect x="3" y="3" width="34" height="34" rx="17" fill={color} />}
    </Svg>
  );
}
