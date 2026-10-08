import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

export type Palette = {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  danger: string;
  bubbleIn: string;
  bubbleOut: string;
};

const light: Palette = {
  bg: '#F4F2EE',
  surface: '#FFFFFF',
  border: '#E2DED6',
  text: '#1D1B18',
  muted: '#6E6A63',
  accent: '#2F6B4F',
  accentText: '#FFFFFF',
  danger: '#B3261E',
  bubbleIn: '#E8E5DF',
  bubbleOut: '#2F6B4F',
};

const dark: Palette = {
  bg: '#141412',
  surface: '#1F1E1B',
  border: '#33312C',
  text: '#F1EEE8',
  muted: '#A19C93',
  accent: '#5FB38A',
  accentText: '#0E1F17',
  danger: '#F2867E',
  bubbleIn: '#2A2925',
  bubbleOut: '#3E8A66',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={[s.header, { borderColor: p.border, backgroundColor: p.surface }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={[s.back, { color: p.accent }]}>‹ Back</Text>
        </Pressable>
      ) : null}
      <Text style={[s.headerTitle, { color: p.text }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={s.headerRight}>{right}</View>
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const p = usePalette();
  const bg = kind === 'primary' ? p.accent : 'transparent';
  const fg = kind === 'primary' ? p.accentText : kind === 'danger' ? p.danger : p.accent;
  const border = kind === 'primary' ? p.accent : kind === 'danger' ? p.danger : p.border;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const p = usePalette();
  return <View style={[s.card, { backgroundColor: p.surface, borderColor: p.border }, style]}>{children}</View>;
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const p = usePalette();
  return (
    <View style={s.field}>
      <Text style={[s.label, { color: p.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={p.muted}
        {...props}
        style={[s.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }, props.style]}
      />
      {hint ? <Text style={[s.hint, { color: p.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  right,
  onPress,
  dim,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  dim?: boolean;
}) {
  const p = usePalette();
  const content = (
    <View style={[s.row, { borderColor: p.border, opacity: dim ? 0.5 : 1 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, { color: p.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[s.rowSub, { color: p.muted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? p.border : p.surface })}>
      {content}
    </Pressable>
  ) : (
    <View style={{ backgroundColor: p.surface }}>{content}</View>
  );
}

export function Badge({ text, tone = 'accent' }: { text: string; tone?: 'accent' | 'muted' | 'danger' }) {
  const p = usePalette();
  const color = tone === 'accent' ? p.accent : tone === 'danger' ? p.danger : p.muted;
  return (
    <View style={[s.badge, { borderColor: color }]}>
      <Text style={[s.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  const p = usePalette();
  return (
    <View style={s.empty}>
      <Text style={[s.emptyTitle, { color: p.text }]}>{title}</Text>
      {body ? <Text style={[s.emptyBody, { color: p.muted }]}>{body}</Text> : null}
    </View>
  );
}

export function Note({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'danger' }) {
  const p = usePalette();
  return <Text style={[s.note, { color: tone === 'danger' ? p.danger : p.muted }]}>{children}</Text>;
}

export const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { fontSize: 17, fontWeight: '500' },
  headerTitle: { flex: 1, fontSize: 19, fontWeight: '700' },
  headerRight: { flexDirection: 'row', gap: 8 },
  button: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 16, gap: 10 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  hint: { fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 14, marginTop: 2 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  empty: { padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyBody: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  note: { fontSize: 14, lineHeight: 20 },
  pad: { padding: 16, gap: 14 },
});
