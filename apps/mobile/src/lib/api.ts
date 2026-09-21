import Constants from 'expo-constants';

/**
 * Base URL of the API. `EXPO_PUBLIC_API_URL` is inlined at build time (eas.json
 * per profile or a local .env). When it is missing in development we point at
 * the Metro host so a phone on the same Wi-Fi reaches `pnpm dev` without config.
 */
export function apiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && host) return `http://${host}:3000`;

  throw new Error('EXPO_PUBLIC_API_URL is not set');
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiGet<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  });
  if (!response.ok) {
    let message = 'Algo salió mal. Probá de nuevo en un rato.';
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === 'string') message = body.message;
    } catch {
      // keep the generic message
    }
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  info?: {
    database?: { status: 'up' | 'down' };
    app?: { status: 'up'; version: string; uptimeSeconds: number };
  };
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>('/health');
}
