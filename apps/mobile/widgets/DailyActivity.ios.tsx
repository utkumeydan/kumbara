import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type DailyActivityProps = { today: string; left: string; days: number; spentToday: string };

// Kilit ekranı ve Dynamic Island: bugün harcayabileceğin tutar (Canlı Etkinlikler en fazla bir gün sürer)
const DailyActivity = (props: DailyActivityProps, _env: LiveActivityEnvironment) => {
  'widget';
  const coral = '#FF6B57';
  const muted = '#9A958F';
  return {
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 14 })]}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(muted)]}>Bugün harcayabileceğin</Text>
          <Text modifiers={[font({ size: 28, weight: 'heavy', design: 'rounded' }), foregroundStyle(coral)]}>{props.today}</Text>
        </VStack>
        <VStack alignment="trailing" spacing={2}>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>Maaşa {props.days} gün</Text>
          <Text modifiers={[font({ size: 15, weight: 'bold' })]}>{props.left} kaldı</Text>
          <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>bugün {props.spentToday}</Text>
        </VStack>
      </HStack>
    ),
    compactLeading: <Text modifiers={[font({ size: 13, weight: 'bold' })]}>🐢</Text>,
    compactTrailing: <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(coral)]}>{props.today}</Text>,
    minimal: <Text modifiers={[font({ size: 12, weight: 'bold' })]}>🐢</Text>,
    expandedLeading: (
      <VStack alignment="leading">
        <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>Bugün</Text>
        <Text modifiers={[font({ size: 20, weight: 'heavy' }), foregroundStyle(coral)]}>{props.today}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing">
        <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>Maaşa {props.days} gün</Text>
        <Text modifiers={[font({ size: 16, weight: 'bold' })]}>{props.left}</Text>
      </VStack>
    ),
    expandedBottom: <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>Bugün {props.spentToday} harcadın</Text>,
  };
};

export default createLiveActivity('DailyActivity', DailyActivity);
