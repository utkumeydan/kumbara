import { Column, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type BudgetWidgetProps = { left: string; days: number; perDay: string; negative: boolean; ready: boolean };

// Android ana ekran widget'ı: maaşa kadar harcanabilir tutar. Widget ayrı bir çalışma ortamında
// çalıştığı için sabitler fonksiyonun içinde tanımlanır; Android'de yalnızca colorScheme gelir.
const BudgetWidget = (props: BudgetWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme !== 'light';
  const bg = dark ? '#1B1A1C' : '#FFFFFF';
  const fg = dark ? '#F5F3F0' : '#16161A';
  const muted = dark ? '#9A958F' : '#625C56';
  const coral = '#FF6B57';
  const amountColor = props.negative ? '#FF5C5C' : fg;

  return (
    <Column modifiers={[fillMaxSize(), cornerRadius(24), background(bg), paddingAll(16)]} verticalArrangement="spaceBetween">
      <Row modifiers={[fillMaxWidth()]} horizontalArrangement="spaceBetween">
        <Text color={muted} style={{ fontSize: 12, fontWeight: '600' }}>
          {props.ready ? `Maaşa ${props.days} gün` : 'Kumbara'}
        </Text>
        <Text color={coral} style={{ fontSize: 12, fontWeight: '700' }}>
          🐢
        </Text>
      </Row>
      <Spacer modifiers={[height(6)]} />
      <Column>
        <Text color={amountColor} maxLines={1} style={{ fontSize: 30, fontWeight: '800' }}>
          {props.left}
        </Text>
        <Text color={muted} style={{ fontSize: 12, fontWeight: '600' }}>
          harcamak için kaldı
        </Text>
      </Column>
      <Spacer modifiers={[height(6)]} />
      <Text color={coral} style={{ fontSize: 13, fontWeight: '700' }}>
        {props.ready ? `günde ${props.perDay}` : 'Uygulamayı aç ve dönemi başlat'}
      </Text>
    </Column>
  );
};

export default createWidget('BudgetWidget', BudgetWidget, { left: '₺0', days: 0, perDay: '₺0', negative: false, ready: false });
