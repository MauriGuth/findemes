import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from '../config/env.schema.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface EncryptedPayload {
  payloadEnc: Uint8Array<ArrayBuffer>;
  payloadIv: Uint8Array<ArrayBuffer>;
  keyVersion: number;
}

export const CAPTURE_UNAVAILABLE = 'La captura automática todavía no está disponible.';

/**
 * AES-256-GCM for RawEvent payloads (ADR 009). The auth tag travels appended to the
 * ciphertext; the user id is additional authenticated data, so a payload copied to
 * another user's row fails to decrypt. The key never touches the database.
 */
@Injectable()
export class RawEventCrypto {
  private readonly key: Buffer | null;
  readonly keyVersion: number;

  constructor(config: ConfigService<Env, true>) {
    const key = config.get('RAW_EVENT_KEY', { infer: true });
    this.key = key ? Buffer.from(key, 'base64') : null;
    this.keyVersion = config.get('RAW_EVENT_KEY_VERSION', { infer: true });
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  private requireKey(): Buffer {
    if (!this.key) throw new ServiceUnavailableException({ message: CAPTURE_UNAVAILABLE });
    return this.key;
  }

  encrypt(userId: string, payload: unknown): EncryptedPayload {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.requireKey(), iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(`raw-event:${userId}`));
    const body = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return {
      payloadEnc: new Uint8Array(body),
      payloadIv: new Uint8Array(iv),
      keyVersion: this.keyVersion,
    };
  }

  decrypt<T>(userId: string, row: EncryptedPayload): T {
    if (row.keyVersion !== this.keyVersion) {
      throw new Error(`RawEvent key version ${String(row.keyVersion)} is not loaded`);
    }
    const data = Buffer.from(row.payloadEnc);
    const decipher = createDecipheriv(ALGORITHM, this.requireKey(), Buffer.from(row.payloadIv), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(`raw-event:${userId}`));
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
    const plain = Buffer.concat([
      decipher.update(data.subarray(0, data.length - TAG_BYTES)),
      decipher.final(),
    ]);
    return JSON.parse(plain.toString('utf8')) as T;
  }
}
