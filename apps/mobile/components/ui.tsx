import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, SoftGlow } from '@/components/Glass';
import { TurtleFace } from '@/components/Turtle';
import { FONT, useTheme } from '@/lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// Zeminin üstünde hafif limon ve deniz yeşili ışıma; içerikle yarışmaz
export function Glow({ height = 340 }: { height?: number }) {
  const c = useTheme();
  const dark = c.scheme === 'dark';
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height + 160, overflow: 'hidden' }}>
      <LinearGradient colors={[c.glow, c.bg]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height }} />
      <SoftGlow color="#D4F36A" size={360} opacity={dark ? 0.13 : 0.45} style={{ position: 'absolute', top: -170, left: -120 }} />
      <SoftGlow color="#5ED1C1" size={300} opacity={dark ? 0.09 : 0.25} style={{ position: 'absolute', top: -60, right: -150 }} />
    </View>
  );
}

export function Screen({
  children,
  scroll = true,
  glow = true,
  header,
  footer,
  bottomInset = 32,
}: {
  children: ReactNode;
  scroll?: boolean;
  glow?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  bottomInset?: number;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const inner: ViewStyle = { padding: 16, paddingTop: header ? 8 : insets.top + 14, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {glow && <Glow />}
      {header ? <View style={{ paddingTop: insets.top + 6 }}>{header}</View> : null}
      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[inner, { paddingBottom: insets.bottom + bottomInset }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[inner, { flex: 1, paddingBottom: insets.bottom + 12 }]}>{children}</View>
      )}
      {footer ? <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg, maxWidth: 560, width: '100%', alignSelf: 'center' }}>{footer}</View> : null}
    </View>
  );
}

const ICON_LABELS: Partial<Record<string, string>> = {
  close: 'Kapat',
  'chevron-back': 'Geri',
  add: 'Ekle',
  remove: 'Azalt',
  pencil: 'Düzenle',
  'trash-outline': 'Sil',
};

// Renk verilmezse buzlu cam daire, verilirse dolu daire
export function RoundButton({ icon, onPress, size = 44, bg, color, label }: { icon: IconName; onPress?: () => void; size?: number; bg?: string; color?: string; label?: string }) {
  const c = useTheme();
  const glyph = <Ionicons name={icon} size={size * 0.48} color={color ?? c.text} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? ICON_LABELS[icon] ?? icon}
      hitSlop={6}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {bg ? (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>{glyph}</View>
      ) : (
        <Glass radius={size / 2} intensity={30} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {glyph}
        </Glass>
      )}
    </Pressable>
  );
}

// Ortada küçük üst başlık + başlık, solda kapat/geri, sağda isteğe bağlı eylem
export function Header({ title, caption, onClose, back, right }: { title?: string; caption?: string; onClose?: () => void; back?: boolean; right?: ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, minHeight: 52, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <View style={{ width: 48 }}>{onClose ? <RoundButton icon={back ? 'chevron-back' : 'close'} onPress={onClose} /> : null}</View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        {caption ? <Text numberOfLines={1} style={{ color: c.muted, fontSize: 11, fontWeight: '600' }}>{caption}</Text> : null}
        {title ? <Text numberOfLines={1} style={{ color: c.text, fontSize: 17, fontFamily: FONT.bold, letterSpacing: -0.2 }}>{title}</Text> : null}
      </View>
      <View style={{ width: 48, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useTheme();
  // Düz, net yüzey: ince kenarlık, yumuşak köşe
  const base = [{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 24, padding: 18 }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    // Rol verilmez: web'de "button" rolü <button> üretir ve içindeki düğmelerle iç içe geçer
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>
      {children}
    </Pressable>
  );
}

type Variant = 'hero' | 'display' | 'title' | 'h2' | 'body' | 'label' | 'small' | 'tiny';
const sizes: Record<Variant, TextStyle> = {
  hero: { fontSize: 60, fontFamily: FONT.display, letterSpacing: -2.4, lineHeight: 66 },
  display: { fontSize: 38, fontFamily: FONT.display, letterSpacing: -1.4, lineHeight: 44 },
  title: { fontSize: 30, fontFamily: FONT.display, letterSpacing: -0.9, lineHeight: 36 },
  h2: { fontSize: 20, fontFamily: FONT.bold, letterSpacing: -0.4, lineHeight: 26 },
  body: { fontSize: 15 },
  label: { fontSize: 14, fontWeight: '700' },
  small: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 11, fontWeight: '600' },
};

export function T({
  children,
  v = 'body',
  muted,
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  v?: Variant;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const c = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[sizes[v], { color: color ?? (muted ? c.muted : c.text) }, style]}>
      {children}
    </Text>
  );
}

// Büyük tutar: ₺ işareti küçük ve üstte
export function Money({ value, v = 'hero', color }: { value: string; v?: 'hero' | 'display' | 'title' | 'h2'; color?: string }) {
  const c = useTheme();
  const size = sizes[v].fontSize!;
  const [, sign, rest] = value.match(/^(-?₺)(.*)$/) ?? [null, '', value];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <Text style={{ color: color ?? c.text, fontSize: size * 0.55, fontFamily: FONT.bold, marginTop: size * 0.14, marginRight: 2 }}>{sign}</Text>
      <Text style={[sizes[v], { color: color ?? c.text }]}>{rest}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  loading,
  disabled,
  icon,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'inverse' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = useTheme();
  const bg = { primary: c.primary, inverse: c.inverse, secondary: c.cardAlt, danger: c.danger, ghost: 'transparent' }[kind];
  const fg = { primary: c.primaryText, inverse: c.inverseText, secondary: c.text, danger: '#fff', ghost: c.muted }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        {
          backgroundColor: disabled ? c.card : bg,
          borderRadius: small ? 14 : 18,
          minHeight: small ? 40 : 56,
          paddingVertical: small ? 9 : 15,
          paddingHorizontal: small ? 16 : 22,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
        },
        pressed && { opacity: 0.85 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={disabled ? c.faint : fg} /> : null}
          <Text numberOfLines={1} style={{ color: disabled ? c.faint : fg, fontFamily: FONT.bold, fontSize: small ? 14 : 16, letterSpacing: -0.1 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, style, ...props }: TextInputProps & { label?: string; hint?: string }) {
  const c = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      {label ? <T v="tiny" muted>{label}</T> : null}
      <TextInput
        accessibilityLabel={label ?? props.placeholder}
        placeholderTextColor={c.faint}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[
          { backgroundColor: c.card, borderWidth: 1.5, borderColor: focus ? c.accent : c.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16, color: c.text, outlineWidth: 0 } as TextStyle,
          style,
        ]}
        {...props}
      />
      {hint ? <T v="small" muted>{hint}</T> : null}
    </View>
  );
}

export function Chip({ label, active, onPress, dot, icon }: { label: string; active?: boolean; onPress?: () => void; dot?: string; icon?: IconName }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingVertical: 9,
        paddingHorizontal: 14,
        minHeight: 40,
        borderRadius: 14,
        backgroundColor: active ? (dot ?? c.inverse) : c.card,
        borderWidth: 1,
        borderColor: active ? 'transparent' : c.border,
      }}>
      {dot ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: active ? c.onPastel : dot }} /> : null}
      {icon ? <Ionicons name={icon} size={16} color={active ? c.inverseText : c.text} /> : null}
      <Text numberOfLines={1} style={{ color: active ? (dot ? c.onPastel : c.inverseText) : c.text, fontWeight: '700', fontSize: 13.5 }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<K extends string>({ value, options, onChange }: { value: K; options: { key: K; label: string; icon?: IconName }[]; onChange: (k: K) => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', padding: 4, borderRadius: 18, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            style={{ flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.inverse : 'transparent' }}>
            {o.icon ? <Ionicons name={o.icon} size={16} color={on ? c.inverseText : c.muted} /> : null}
            <Text style={{ color: on ? c.inverseText : c.muted, fontWeight: '700', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value, color, height = 6, track }: { value: number; color: string; height?: number; track?: string }) {
  const c = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height, backgroundColor: track ?? c.cardAlt, borderRadius: height, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export function Row({ children, gap = 10, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Wrap({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{children}</View>;
}

// Renk tonlu yuvarlatılmış kare içinde simge
export function IconTile({ icon, bg, color, size = 40 }: { icon: IconName; bg: string; color?: string; size?: number }) {
  const c = useTheme();
  const tint = bg.startsWith('#') && bg.length === 7 ? bg : c.primary;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.34, backgroundColor: tint + (c.scheme === 'dark' ? '1F' : '40'), alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={color ?? (c.scheme === 'dark' ? tint : c.text)} />
    </View>
  );
}

export function ListRow({
  icon,
  iconBg,
  leading,
  title,
  subtitle,
  right,
  onPress,
  chevron = true,
}: {
  icon?: IconName;
  iconBg?: string;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const c = useTheme();
  return (
    <Card onPress={onPress} style={{ paddingVertical: 14 }}>
      <Row gap={12}>
        {leading ?? (icon ? <IconTile icon={icon} bg={iconBg ?? c.primary} /> : null)}
        <View style={{ flex: 1 }}>
          {typeof title === 'string' ? <T v="label">{title}</T> : title}
          {subtitle ? (typeof subtitle === 'string' ? <T v="small" muted>{subtitle}</T> : subtitle) : null}
        </View>
        {right}
        {onPress && chevron ? <Ionicons name="chevron-forward" size={18} color={c.muted} /> : null}
      </Row>
    </Card>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 12 }}>
      <T v="label" muted style={{ flexShrink: 1 }} numberOfLines={1}>{title}</T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="link">
          <T v="label" color={c.accent}>{action}</T>
        </Pressable>
      ) : null}
    </Row>
  );
}

export function ColorPicker({ value, onChange, colors }: { value: string; onChange: (c: string) => void; colors: string[] }) {
  const c = useTheme();
  return (
    <Wrap gap={10}>
      {colors.map((col) => (
        <Pressable
          key={col}
          onPress={() => onChange(col)}
          accessibilityRole="radio"
          accessibilityLabel={`Renk ${col}`}
          accessibilityState={{ selected: value === col }}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: col, borderWidth: 3, borderColor: value === col ? c.text : 'transparent' }}
        />
      ))}
    </Wrap>
  );
}

export function IconPicker({ value, onChange, icons }: { value: string; onChange: (i: string) => void; icons: string[] }) {
  const c = useTheme();
  return (
    <Wrap gap={8}>
      {icons.map((i) => (
        <Pressable
          key={i}
          onPress={() => onChange(i)}
          accessibilityRole="radio"
          accessibilityLabel={`Simge ${i}`}
          accessibilityState={{ selected: value === i }}
          style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: value === i ? c.cardAlt : c.card, borderWidth: 2, borderColor: value === i ? c.text : 'transparent' }}>
          <Text style={{ fontSize: 22 }}>{i}</Text>
        </Pressable>
      ))}
    </Wrap>
  );
}

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Takvim yaprağı gibi gün/ay rozeti; ödeme listelerinde tarihi bir bakışta okutur
export function DateBadge({ iso, tone }: { iso: string | null; tone?: 'danger' | 'accent' }) {
  const c = useTheme();
  const [, m, d] = (iso ?? '').split('-').map(Number);
  const fg = tone === 'danger' ? c.danger : c.text;
  return (
    <View style={{ width: 46, height: 48, borderRadius: 14, backgroundColor: tone === 'accent' ? c.primary + '22' : c.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
      {iso ? (
        <>
          <Text style={{ fontFamily: FONT.display, fontSize: 18, lineHeight: 20, color: tone === 'accent' ? c.accent : fg }}>{d}</Text>
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: tone === 'danger' ? c.danger : c.muted, textTransform: 'uppercase' }}>{MONTH_SHORT[m - 1]}</Text>
        </>
      ) : (
        <Ionicons name="repeat" size={18} color={c.muted} />
      )}
    </View>
  );
}

// Küçük etiket + değer; özet kartlarında yan yana kullanılır
export function Stat({ label, value, color, align = 'left' }: { label: string; value: string; color?: string; align?: 'left' | 'right' }) {
  const c = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 3 }}>
      <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '600', color: c.muted }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: FONT.bold, fontSize: 17, letterSpacing: -0.3, color: color ?? c.text }}>{value}</Text>
    </View>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  const c = useTheme();
  if (!error) return null;
  return <T v="small" color={c.danger}>{error instanceof Error ? error.message : String(error)}</T>;
}

export function Empty({ title, text, action, onAction, mood = 'calm' }: { title: string; text?: string; action?: string; onAction?: () => void; mood?: 'happy' | 'calm' | 'sad' }) {
  const c = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, gap: 8 }}>
      <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <TurtleFace size={100} mood={mood} />
      </View>
      <T v="h2" style={{ textAlign: 'center' }}>{title}</T>
      {text ? <T v="small" muted style={{ textAlign: 'center', maxWidth: 300 }}>{text}</T> : null}
      {action && onAction ? <Button title={action} onPress={onAction} small style={{ marginTop: 10 }} /> : null}
    </View>
  );
}

// Veri yüklenirken döner; hata varsa mesaj ve "Tekrar dene" gösterir
export function Loading({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const c = useTheme();
  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, padding: 24, gap: 14 }}>
        <Text style={{ fontSize: 44 }}>🔌</Text>
        <T v="h2" style={{ textAlign: 'center' }}>Veriler yüklenemedi</T>
        <T muted style={{ textAlign: 'center' }}>{error instanceof Error ? error.message : 'Bir şeyler ters gitti'}</T>
        {onRetry ? <Button title="Tekrar dene" icon="refresh" onPress={onRetry} /> : null}
      </View>
    );
  }
  return (
    <View accessibilityLabel="Yükleniyor" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator color={c.primary} size="large" />
    </View>
  );
}
