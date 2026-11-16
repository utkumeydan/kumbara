// Canlı Etkinlikler yalnızca iOS'ta vardır; diğer platformlarda boş arayüz
export type DailyActivityProps = { today: string; left: string; days: number; spentToday: string };

type Instance = { update(props: DailyActivityProps): Promise<void>; end(): Promise<void> };

const DailyActivity = {
  start(_props: DailyActivityProps): Instance | null {
    return null;
  },
  getInstances(): Instance[] {
    return [];
  },
};

export default DailyActivity;
