import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

// Basit sütun grafik; genişliği kapsayıcıya göre ayarlanır
export function BarChart({ data, color, height = 140 }: { data: number[]; color: string; height?: number }) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...data);
  const gap = data.length > 20 ? 2 : 6;
  const barW = data.length ? Math.min(28, Math.max(2, (width - gap * (data.length - 1)) / data.length)) : 0;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {data.map((v, i) => {
            const h = Math.max(v > 0 ? 3 : 2, (v / max) * (height - 4));
            return (
              <Rect
                key={i}
                x={i * (barW + gap)}
                y={height - h}
                width={barW}
                height={h}
                rx={Math.min(4, barW / 2)}
                fill={v > 0 ? color : c.border}
              />
            );
          })}
        </Svg>
      )}
    </View>
  );
}
