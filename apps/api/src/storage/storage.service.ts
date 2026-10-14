import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CLOCK, type Clock } from '../common/clock.js';
import { type Env } from '../config/env.schema.js';
import { presignS3Url } from './sigv4.js';

/** Largest photo accepted: the app sends ≤ 1600 px JPEG 80 (≈ 300–600 kB). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Ticket photos in an S3-compatible bucket (ADR 014), never on the container's disk.
 * Everything goes through short-lived presigned URLs: the phone uploads with one, the API
 * reads and deletes with others. Without S3_* the feature reports "not available".
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Config | null;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const bucket = config.get('S3_BUCKET', { infer: true });
    const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true });
    this.s3 =
      endpoint && bucket && accessKeyId && secretAccessKey
        ? {
            endpoint: endpoint.replace(/\/+$/, ''),
            region: config.get('S3_REGION', { infer: true }),
            bucket,
            accessKeyId,
            secretAccessKey,
          }
        : null;
  }

  get enabled(): boolean {
    return this.s3 !== null;
  }

  private require(): S3Config {
    if (!this.s3) throw new Error('storage_not_configured');
    return this.s3;
  }

  /** Path-style URL: works on R2, MinIO and AWS alike. */
  private objectUrl(key: string): string {
    const s3 = this.require();
    return `${s3.endpoint}/${s3.bucket}/${key}`;
  }

  presign(method: 'GET' | 'PUT' | 'DELETE', key: string, expiresSeconds: number): string {
    const s3 = this.require();
    return presignS3Url({
      method,
      url: this.objectUrl(key),
      region: s3.region,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
      now: this.clock.now(),
      expiresSeconds,
    });
  }

  async put(key: string, body: Uint8Array, contentType = 'image/jpeg'): Promise<void> {
    const response = await fetch(this.presign('PUT', key, 300), {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`storage_put_${String(response.status)}`);
  }

  /** null when the object does not exist (the phone never finished the upload). */
  async get(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    const response = await fetch(this.presign('GET', key, 300), {
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`storage_get_${String(response.status)}`);
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_IMAGE_BYTES) throw new Error('storage_too_large');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('storage_too_large');
    return { bytes, contentType: response.headers.get('content-type') ?? 'image/jpeg' };
  }

  /** Best effort: a leftover object is harmless and the bucket lifecycle can sweep it. */
  async delete(key: string): Promise<void> {
    if (!this.s3) return;
    try {
      const response = await fetch(this.presign('DELETE', key, 300), {
        method: 'DELETE',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok && response.status !== 404) {
        this.logger.warn(`storage.delete_failed status=${String(response.status)}`);
      }
    } catch {
      this.logger.warn('storage.delete_failed');
    }
  }
}
