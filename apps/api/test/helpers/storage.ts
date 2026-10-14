/** In-memory stand-in for the S3 bucket: same surface as StorageService. */
export class FakeStorage {
  readonly enabled = true;
  readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();
  readonly deleted: string[] = [];

  presign(method: string, key: string): string {
    return `https://bucket.test/${key}?method=${method}`;
  }

  put(key: string, body: Uint8Array, contentType = 'image/jpeg'): Promise<void> {
    this.objects.set(key, { bytes: Buffer.from(body), contentType });
    return Promise.resolve();
  }

  get(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.objects.keys()]) if (key.startsWith(prefix)) await this.delete(key);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    this.deleted.push(key);
    return Promise.resolve();
  }
}
