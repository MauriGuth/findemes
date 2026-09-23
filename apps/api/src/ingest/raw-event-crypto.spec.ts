import { type ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { type Env } from '../config/env.schema.js';
import { RawEventCrypto } from './raw-event-crypto.js';

function crypto(key: string | undefined, version = 1): RawEventCrypto {
  const values: Record<string, unknown> = { RAW_EVENT_KEY: key, RAW_EVENT_KEY_VERSION: version };
  return new RawEventCrypto({ get: (name: string) => values[name] } as ConfigService<Env, true>);
}

const KEY = Buffer.alloc(32, 1).toString('base64');
const OTHER = Buffer.alloc(32, 2).toString('base64');
const payload = { title: 'Pagaste', text: 'algo' };

describe('RawEventCrypto', () => {
  it('round-trips and uses a fresh IV every time', () => {
    const c = crypto(KEY);
    const a = c.encrypt('user-1', payload);
    const b = c.encrypt('user-1', payload);
    expect(Buffer.from(a.payloadIv).equals(Buffer.from(b.payloadIv))).toBe(false);
    expect(Buffer.from(a.payloadEnc).toString('utf8')).not.toContain('Pagaste');
    expect(c.decrypt('user-1', a)).toEqual(payload);
  });

  it('fails with another key, another user or a tampered payload', () => {
    const encrypted = crypto(KEY).encrypt('user-1', payload);
    expect(() => crypto(OTHER).decrypt('user-1', encrypted)).toThrow();
    expect(() => crypto(KEY).decrypt('user-2', encrypted)).toThrow();
    const tampered = new Uint8Array(encrypted.payloadEnc);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    expect(() => crypto(KEY).decrypt('user-1', { ...encrypted, payloadEnc: tampered })).toThrow();
  });

  it('refuses an unknown key version and reports when it is disabled', () => {
    const encrypted = crypto(KEY, 1).encrypt('user-1', payload);
    expect(() => crypto(KEY, 2).decrypt('user-1', encrypted)).toThrow(/version/);
    const off = crypto(undefined);
    expect(off.enabled).toBe(false);
    expect(() => off.encrypt('user-1', payload)).toThrow();
  });
});
