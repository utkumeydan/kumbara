import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, lineLimit, minimumScaleFactor, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type BudgetWidgetProps = { left: string; days: number; perDay: string; negative: boolean; ready: boolean };

// Ana ekran ve kilit ekranı: maaşa kadar harcanabilir tutar. Widget ayrı bir çalışma ortamında
// çalıştığı için sabitler fonksiyonun içinde tanımlanır.
const BudgetWidget = (props: BudgetWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const coral = '#FF6B57';
  const bg = '#0B0B0C';
  const fg = '#F5F3F0';
  const muted = '#9A958F';
  const amountColor = props.negative ? '#FF5C5C' : fg;
  const days = props.ready ? `Maaşa ${props.days} gün` : 'Kumbara';

  if (environment.widgetFamily === 'accessoryInline') {
    return <Text>{props.ready ? `${props.left} kaldı · ${props.days} gün` : 'Kumbara'}</Text>;
  }
  if (environment.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL('kumbara://add')]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' })]}>{days}</Text>
        <Text modifiers={[font({ size: 22, weight: 'heavy', design: 'rounded' }), minimumScaleFactor(0.6), lineLimit(1)]}>{props.left}</Text>
        <Text modifiers={[font({ size: 11 })]}>günde {props.perDay}</Text>
      </VStack>
    );
  }
  if (environment.widgetFamily === 'systemMedium') {
    return (
      <HStack spacing={12} modifiers={[padding({ all: 4 }), containerBackground(bg, 'widget'), widgetURL('kumbara://add')]}>
        <VStack alignment="leading" spacing={4}>
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>harcamak için kaldı</Text>
          <Text modifiers={[font({ size: 38, weight: 'heavy', design: 'rounded' }), foregroundStyle(amountColor), minimumScaleFactor(0.5), lineLimit(1)]}>{props.left}</Text>
          <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle(fg)]}>{days}</Text>
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={4}>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>günlük pay</Text>
          <Text modifiers={[font({ size: 20, weight: 'bold' }), foregroundStyle(coral)]}>{props.perDay}</Text>
        </VStack>
      </HStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={4} modifiers={[containerBackground(bg, 'widget'), widgetURL('kumbara://add')]}>
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(muted)]}>{days}</Text>
      <Spacer />
      <Text modifiers={[font({ size: 30, weight: 'heavy', design: 'rounded' }), foregroundStyle(amountColor), minimumScaleFactor(0.5), lineLimit(1)]}>{props.left}</Text>
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(muted)]}>harcamak için kaldı</Text>
      <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(coral)]}>günde {props.perDay}</Text>
    </VStack>
  );
};

export default createWidget('BudgetWidget', BudgetWidget, { left: '₺0', days: 0, perDay: '₺0', negative: false, ready: false });
