import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, isOffline, setSpaceHeader, setToken, setUnauthorizedHandler, type User } from './api';
import { clearPersistedCache } from './persist';
import { unregisterPush } from './push';
import { tokenStore } from './storage';

type AuthState = {
  ready: boolean;
  user: User | null;
  // Seçili ortak alan (yoksa kişisel bütçe)
  space: string | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: (opts?: { remote?: boolean }) => Promise<void>;
  setUser: (u: User) => void;
  setSpace: (id: string | null) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const USER_KEY = 'user';
const SPACE_KEY = 'space';

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [user, setUserState] = useState<User | null>(null);
  const [space, setSpaceState] = useState<string | null>(null);

  const setUser = useCallback((u: User) => {
    setUserState(u);
    AsyncStorage.setItem(USER_KEY, JSON.stringify(u)).catch(() => {});
  }, []);

  const signOut = useCallback(
    async (opts?: { remote?: boolean }) => {
      await unregisterPush();
      if (opts?.remote) await api('POST', '/auth/logout').catch(() => {});
      setToken(null);
      setSpaceHeader(null);
      await tokenStore.set(null);
      await AsyncStorage.multiRemove([USER_KEY, SPACE_KEY, 'pendingTx']).catch(() => {});
      setUserState(null);
      setSpaceState(null);
      qc.clear();
      await clearPersistedCache();
    },
    [qc],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    (async () => {
      const saved = await tokenStore.get();
      if (saved) {
        setToken(saved);
        const [cachedUser, cachedSpace] = await Promise.all([AsyncStorage.getItem(USER_KEY).catch(() => null), AsyncStorage.getItem(SPACE_KEY).catch(() => null)]);
        if (cachedSpace) {
          setSpaceHeader(cachedSpace);
          setSpaceState(cachedSpace);
        }
        try {
          setUser(await api<User>('GET', '/auth/me'));
        } catch (e) {
          // Çevrimdışıyken son bilinen kullanıcıyla açılır; oturum yalnızca sunucu reddederse kapanır
          if (isOffline(e) && cachedUser) setUserState(JSON.parse(cachedUser));
          else setToken(null);
        }
      }
      setReady(true);
    })();
  }, [signOut, setUser]);

  const signIn = useCallback(
    async (token: string, u: User) => {
      setToken(token);
      await tokenStore.set(token);
      setUser(u);
    },
    [setUser],
  );

  const setSpace = useCallback(
    async (id: string | null) => {
      setSpaceHeader(id);
      setSpaceState(id);
      if (id) await AsyncStorage.setItem(SPACE_KEY, id).catch(() => {});
      else await AsyncStorage.removeItem(SPACE_KEY).catch(() => {});
      // Alanlar arasında veriler karışmasın
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'spaces' });
      await qc.invalidateQueries();
    },
    [qc],
  );

  return <AuthContext.Provider value={{ ready, user, space, signIn, signOut, setUser, setSpace }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider eksik');
  return ctx;
}
