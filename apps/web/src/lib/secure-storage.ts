import { isNativePlatform } from './platform';

/**
 * Auf nativen Plattformen: Capacitor Preferences (encrypted auf iOS/Android).
 * Im Browser: Nichts — Token geht per HttpOnly Cookie.
 */

const REFRESH_TOKEN_KEY = 'zeit_refresh_token';

async function getPreferences() {
  if (!isNativePlatform()) return null;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    return Preferences;
  } catch {
    return null;
  }
}

export async function storeRefreshToken(token: string): Promise<void> {
  const prefs = await getPreferences();
  if (prefs) {
    await prefs.set({ key: REFRESH_TOKEN_KEY, value: token });
  }
}

export async function getRefreshToken(): Promise<string | null> {
  const prefs = await getPreferences();
  if (prefs) {
    const result = await prefs.get({ key: REFRESH_TOKEN_KEY });
    return result.value;
  }
  return null;
}

export async function clearRefreshToken(): Promise<void> {
  const prefs = await getPreferences();
  if (prefs) {
    await prefs.remove({ key: REFRESH_TOKEN_KEY });
  }
}
