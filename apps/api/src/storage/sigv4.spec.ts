import { describe, expect, it } from 'vitest';

import { presignS3Url } from './sigv4.js';

describe('presignS3Url', () => {
  // AWS documentation example: "Authenticating Requests: Using Query Parameters (SigV4)".
  it('matches the AWS reference presigned GET', () => {
    const url = presignS3Url({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      now: new Date('2013-05-24T00:00:00Z'),
      expiresSeconds: 86400,
    });
    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('signs the method: a GET URL is not a PUT URL', () => {
    const base = {
      url: 'https://acc.r2.cloudflarestorage.com/bucket/receipts/a/b.jpg',
      region: 'auto',
      accessKeyId: 'id',
      secretAccessKey: 'secret',
      now: new Date('2026-10-14T12:00:00Z'),
      expiresSeconds: 600,
    };
    const get = presignS3Url({ ...base, method: 'GET' });
    const put = presignS3Url({ ...base, method: 'PUT' });
    expect(get).not.toBe(put);
    expect(get.startsWith('https://acc.r2.cloudflarestorage.com/bucket/receipts/a/b.jpg?')).toBe(
      true,
    );
  });
});
