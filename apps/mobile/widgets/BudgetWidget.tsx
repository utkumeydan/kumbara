// iOS dışındaki platformlarda widget yok; aynı arayüz boş işlemlerle sunulur
export type BudgetWidgetProps = { left: string; days: number; perDay: string; negative: boolean; ready: boolean };

const BudgetWidget = {
  updateSnapshot(_props: BudgetWidgetProps) {},
  reload() {},
};

export default BudgetWidget;
