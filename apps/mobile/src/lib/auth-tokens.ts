/**
 * In-memory copy of the session tokens, shared by the API client and the
 * session store without importing each other. Persisted copies live in
 * secure-store (see secure-store.ts); this is what requests read.
 */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

let current: Tokens | null = null;
let onLost: (() => void) | null = null;
let onRotated: ((tokens: Tokens) => void) | null = null;

export function getTokens(): Tokens | null {
  return current;
}

export function setTokens(tokens: Tokens | null): void {
  current = tokens;
}

/** Called by the API client when a refresh fails for good. */
export function setSessionLostHandler(handler: (() => void) | null): void {
  onLost = handler;
}

/** Called by the API client after a successful rotation so the store can persist the pair. */
export function setTokensRotatedHandler(handler: ((tokens: Tokens) => void) | null): void {
  onRotated = handler;
}

export function notifySessionLost(): void {
  current = null;
  onLost?.();
}

export function notifyTokensRotated(tokens: Tokens): void {
  current = tokens;
  onRotated?.(tokens);
}
