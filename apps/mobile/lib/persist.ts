import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// Sorgu önbelleği cihazda saklanır: uygulama çevrimdışı da son bilinen verilerle açılır
export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'kumbara-cache', throttleTime: 1000 });

export async function clearPersistedCache() {
  await persister.removeClient();
}
