import { createHash, createHmac } from 'node:crypto';

export interface PresignInput {
  method: 'GET' | 'PUT' | 'DELETE';
  /** Full object URL, e.g. https://acc.r2.cloudflarestorage.com/bucket/receipts/a/b.jpg */
  url: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  now: Date;
  expiresSeconds: number;
  /** Extra query parameters to sign, e.g. ListObjectsV2's list-type and prefix. */
  query?: Record<string, string>;
}

/** RFC 3986 encoding as AWS wants it (`encodeURIComponent` leaves !'()* alone). */
function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Buffer | string, value: string) =>
  createHmac('sha256', key).update(value).digest();

/**
 * AWS Signature V4 query-string presigning for one S3 object (GET, PUT or DELETE), the
 * only signing the app needs. Works with any S3-compatible store (Cloudflare R2, MinIO).
 * Only the host header is signed and the payload is UNSIGNED-PAYLOAD, so the phone can
 * PUT the photo with a plain fetch.
 */
export function presignS3Url(input: PresignInput): string {
  const url = new URL(input.url);
  const amzDate = input.now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${input.region}/s3/aws4_request`;

  const params: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${input.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(input.expiresSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
    ...Object.entries(input.query ?? {}),
  ];
  const query = params
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const path = url.pathname
    .split('/')
    .map((segment) => encode(decodeURIComponent(segment)))
    .join('/');

  const canonicalRequest = [
    input.method,
    path,
    query,
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), 's3'),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `${url.origin}${path}?${query}&X-Amz-Signature=${signature}`;
}
