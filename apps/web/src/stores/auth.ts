import { create } from 'zustand';
import { api, setAccessToken } from '@/lib/api';
import { isNativePlatform } from '@/lib/platform';
import { getRefreshToken, storeRefreshToken, clearRefreshToken } from '@/lib/secure-storage';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  tryRefresh: () => Promise<boolean>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password) => {
    const data = await api.post<{ accessToken: string }>('/auth/login', {
      email,
      password,
    });
    setAccessToken(data.accessToken);
    await get().loadUser();
  },

  logout: async () => {
    try {
      // Auf Mobile: RefreshToken aus Secure Storage als Header senden
      if (isNativePlatform()) {
        const rt = await getRefreshToken();
        if (rt) {
          await api('/auth/logout', {
            method: 'POST',
            headers: { 'X-Refresh-Token': rt },
          });
        }
      } else {
        await api.post('/auth/logout');
      }
    } catch {
      // ignorieren
    }
    setAccessToken(null);
    await clearRefreshToken();
    set({ user: null, isAuthenticated: false });
  },

  loadUser: async () => {
    try {
      const user = await api.get<User>('/users/me');
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  tryRefresh: async () => {
    try {
      let data: { accessToken: string; refreshToken?: string };

      if (isNativePlatform()) {
        // Mobile: RefreshToken aus Secure Storage lesen und als Header senden
        const rt = await getRefreshToken();
        if (!rt) {
          set({ isLoading: false, isAuthenticated: false });
          return false;
        }
        data = await api<{ accessToken: string; refreshToken?: string }>(
          '/auth/refresh',
          {
            method: 'POST',
            headers: { 'X-Refresh-Token': rt },
            skipAuth: true,
          },
        );
        // Neuen Refresh-Token speichern (Token Rotation)
        if (data.refreshToken) {
          await storeRefreshToken(data.refreshToken);
        }
      } else {
        // Browser: Cookie wird automatisch mitgesendet
        data = await api<{ accessToken: string }>('/auth/refresh', {
          method: 'POST',
          skipAuth: true,
        });
      }

      setAccessToken(data.accessToken);
      await get().loadUser();
      return true;
    } catch {
      set({ isLoading: false, isAuthenticated: false });
      return false;
    }
  },
}));

// Globaler Logout-Listener (bei 401 nach Refresh-Failure)
window.addEventListener('auth:logout', () => {
  useAuth.getState().logout();
});
