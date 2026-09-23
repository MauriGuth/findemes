import { type AuthSession, type User } from '@findemes/shared';
import { create } from 'zustand';

import { logoutSession } from './auth-api';
import { forgetCapture } from './capture';
import {
  setSessionLostHandler,
  setTokens,
  setTokensRotatedHandler,
  type Tokens,
} from './auth-tokens';
import { queryClient } from './query-client';
import { clearStoredTokens, loadStoredSession, storeDeviceId, storeTokens } from './secure-store';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  user: User | null;
  deviceId: string | null;
  hydrate: () => Promise<void>;
  signIn: (session: AuthSession) => Promise<void>;
  signOut: () => Promise<void>;
  /** Local wipe after DELETE /me or a lost session; no API call. */
  forget: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  deviceId: null,

  hydrate: async () => {
    const { tokens, deviceId } = await loadStoredSession();
    setTokens(tokens);
    // The user profile is fetched by the app once signed in; tokens are enough to start.
    set({ status: tokens ? 'signedIn' : 'signedOut', deviceId });
  },

  signIn: async (session) => {
    const tokens: Tokens = { accessToken: session.accessToken, refreshToken: session.refreshToken };
    setTokens(tokens);
    await Promise.all([storeTokens(tokens), storeDeviceId(session.deviceId)]);
    set({ status: 'signedIn', user: session.user, deviceId: session.deviceId });
  },

  signOut: async () => {
    const refreshToken =
      get().status === 'signedIn' ? (await loadStoredSession()).tokens?.refreshToken : undefined;
    if (refreshToken) {
      try {
        await logoutSession(refreshToken);
      } catch {
        // Offline logout still clears the phone; the family expires on its own.
      }
    }
    await get().forget();
  },

  forget: async () => {
    setTokens(null);
    await clearStoredTokens();
    // The server already revoked the ingest token with the session; this clears the phone.
    await forgetCapture();
    queryClient.clear();
    set({ status: 'signedOut', user: null });
  },

  setUser: (user) => set({ user }),
}));

setSessionLostHandler(() => {
  void useSession.getState().forget();
});
setTokensRotatedHandler((tokens) => {
  void storeTokens(tokens);
});
