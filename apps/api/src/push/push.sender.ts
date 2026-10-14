export interface PushMessage {
  /** "ExponentPushToken[…]" */
  to: string;
  title: string;
  body: string;
  /** Where the app goes when the notification is tapped, e.g. { url: '/(app)/pending' }. */
  data?: Record<string, string>;
}

export type PushTicket = { ok: true } | { ok: false; unregistered: boolean };

/** Sends push notifications; a fake in tests, Expo's service otherwise (ADR 015). */
export interface PushSender {
  send(messages: PushMessage[]): Promise<PushTicket[]>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/**
 * Expo's push service: one HTTPS call, no credentials on our side (EXPO_ACCESS_TOKEN only if
 * "enhanced security" is turned on in the Expo project). Delivery to Android needs the FCM key
 * uploaded to EAS; without it the app never gets a token, so nothing is sent.
 */
export class ExpoPushSender implements PushSender {
  constructor(private readonly accessToken: string | undefined) {}

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    if (messages.length === 0) return [];
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: JSON.stringify(
        messages.map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body,
          data: m.data ?? {},
          sound: 'default',
          channelId: 'alerts',
          priority: 'high',
        })),
      ),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`push_${String(response.status)}`);
    const json = (await response.json()) as {
      data?: { status: string; details?: { error?: string } }[];
    };
    return (json.data ?? []).map((ticket) =>
      ticket.status === 'ok'
        ? { ok: true as const }
        : { ok: false as const, unregistered: ticket.details?.error === 'DeviceNotRegistered' },
    );
  }
}

/** Test double: records what would have been sent. */
export class FakePushSender implements PushSender {
  readonly sent: PushMessage[] = [];

  send(messages: PushMessage[]): Promise<PushTicket[]> {
    this.sent.push(...messages);
    return Promise.resolve(messages.map(() => ({ ok: true as const })));
  }
}
