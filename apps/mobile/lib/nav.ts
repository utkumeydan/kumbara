import { router } from 'expo-router';

// Sayfa doğrudan URL ile açıldıysa geri gidilecek geçmiş yoktur
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
