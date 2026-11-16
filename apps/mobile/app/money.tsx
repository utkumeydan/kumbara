import { Redirect } from 'expo-router';

// Eski "Banka durumu" bağlantıları Hesaplar sekmesine yönlenir
export default function Money() {
  return <Redirect href="/accounts" />;
}
