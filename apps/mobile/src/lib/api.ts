import Constants from 'expo-constants';

import { getTokens, notifySessionLost, notifyTokensRotated } from './auth-tokens';

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

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Message for one form field, if the API reported one. */
  fieldMessage(path: string): string | undefined {
    return this.issues.find((issue) => issue.path === path)?.message;
  }
}

export const GENERIC_ERROR = 'Algo salió mal. Probá de nuevo en un rato.';
export const OFFLINE_ERROR = 'No hay conexión. Revisá internet y probá de nuevo.';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  body?: unknown;
  /** Attach the bearer token (default true). */
  auth?: boolean;
}

async function parseError(response: Response): Promise<ApiError> {
  let message = GENERIC_ERROR;
  let issues: ValidationIssue[] = [];
  try {
    const body = (await response.json()) as { message?: unknown; issues?: unknown };
    if (typeof body.message === 'string') message = body.message;
    if (Array.isArray(body.issues)) issues = body.issues as ValidationIssue[];
  } catch {
    // keep the generic message
  }
  return new ApiError(response.status, message, issues);
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time: concurrent 401s wait for the same rotation. */
function refreshOnce(): Promise<boolean> {
  refreshing ??= (async () => {
    const tokens = getTokens();
    if (!tokens) return false;
    try {
      const response = await fetch(`${apiBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!response.ok) return false;
      const next = (await response.json()) as { accessToken: string; refreshToken: string };
      notifyTokensRotated({ accessToken: next.accessToken, refreshToken: next.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function apiRequest<T>(
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, auth = true } = options;

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const tokens = getTokens();
      if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
    try {
      return await fetch(`${apiBaseUrl()}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, OFFLINE_ERROR);
    }
  };

  let response = await send();
  if (response.status === 401 && auth && getTokens()) {
    const refreshed = await refreshOnce();
    if (!refreshed) {
      notifySessionLost();
      throw new ApiError(401, 'Tu sesión venció. Entrá de nuevo.');
    }
    response = await send();
    if (response.status === 401) {
      notifySessionLost();
      throw new ApiError(401, 'Tu sesión venció. Entrá de nuevo.');
    }
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const apiGet = <T>(path: string, options?: RequestOptions) =>
  apiRequest<T>('GET', path, options);
export const apiPost = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>('POST', path, { ...options, body });
export const apiPatch = <T>(path: string, body: unknown, options?: RequestOptions) =>
  apiRequest<T>('PATCH', path, { ...options, body });
export const apiPut = <T>(path: string, body: unknown, options?: RequestOptions) =>
  apiRequest<T>('PUT', path, { ...options, body });
export const apiDelete = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>('DELETE', path, { ...options, body });

export interface HealthResponse {
  status: 'ok' | 'error';
  info?: {
    database?: { status: 'up' | 'down' };
    app?: { status: 'up'; version: string; uptimeSeconds: number };
  };
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>('/health', { auth: false });
}
