import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { DateBadge, Row, T } from '@/components/ui';
import { formatMoney, relativeDay, todayIso } from '@/lib/money';
import { KIND_META, openPlanItem, type PlanRow } from '@/lib/plan';
import { useTheme } from '@/lib/theme';

const money = (n: number) => formatMoney(n, { cents: n % 100 !== 0 });

// Ödeme satırı; kart ekstresinde içindeki taksitler altta listelenir
export function PlanRowView({ row }: { row: PlanRow }) {
  const c = useTheme();
  const today = todayIso();
  // Ödendi takibi yalnızca takvim kalemlerinde var; sabit giderlerde geçen gün uyarı sayılmaz
  const late = row.item.ref.type === 'schedule' && !row.paid && !!row.date && row.date < today;
  const source = row.item.source && row.item.source !== row.label && !row.children.length ? ` · ${row.item.source}` : '';
  const status = row.paid ? ' · ödendi' : late ? ' · tarihi geçti' : row.date ? ` · ${relativeDay(row.date)}` : '';
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={() => openPlanItem(row.item)}
        accessibilityRole="button"
        accessibilityLabel={`${row.label} ${money(row.amount)}${row.date ? `, ${relativeDay(row.date)}` : ''}`}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <Row gap={12}>
          <DateBadge iso={row.date} tone={late ? 'danger' : undefined} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="label" muted={row.paid} numberOfLines={1} style={row.paid ? { textDecorationLine: 'line-through' } : undefined}>{row.label}</T>
            <Row gap={6}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: KIND_META[row.kind].color }} />
              <T v="tiny" color={late ? c.danger : c.muted} numberOfLines={1} style={{ flexShrink: 1 }}>{KIND_META[row.kind].label}{source}{status}</T>
            </Row>
          </View>
          <T v="label" muted={row.paid}>{money(row.amount)}</T>
          {row.paid && <Ionicons name="checkmark-circle" size={16} color={c.success} />}
        </Row>
      </Pressable>
      {row.children.length > 0 && (
        <View style={{ marginLeft: 58, gap: 7, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: c.border }}>
          {row.children.map((x, i) => (
            <Pressable key={`${x.ref.id}-${i}`} onPress={() => openPlanItem(x)} accessibilityRole="button" accessibilityLabel={`${x.label} ${money(x.amount)}`}>
              <Row gap={8} style={{ justifyContent: 'space-between' }}>
                <T v="small" muted numberOfLines={1} style={{ flex: 1, ...(x.paid ? { textDecorationLine: 'line-through' as const } : null) }}>
                  {x.kind === 'card' ? 'Dönem harcamaları' : x.label}
                </T>
                <T v="small" muted>{money(x.amount)}</T>
              </Row>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
