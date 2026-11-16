import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Native'de anahtar zincirinde, web'de localStorage'da saklanır
export const tokenStore = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem('token');
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync('token');
  },
  async set(value: string | null) {
    if (Platform.OS === 'web') {
      try {
        if (value) localStorage.setItem('token', value);
        else localStorage.removeItem('token');
      } catch {}
      return;
    }
    if (value) await SecureStore.setItemAsync('token', value);
    else await SecureStore.deleteItemAsync('token');
  },
};
