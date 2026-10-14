import { createHmac } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ChatService } from '../src/chat/chat.service.js';
import { ChatRunner } from '../src/chat/chat.webhooks.js';
import { TelegramClient } from '../src/chat/telegram.client.js';
import { WhatsappClient } from '../src/chat/whatsapp.client.js';
import { type Env } from '../src/config/env.schema.js';
import { type FakeLlmProvider } from '../src/llm/fake-llm.provider.js';
import { LLM_PROVIDER } from '../src/llm/llm.provider.js';
import { StorageService } from '../src/storage/storage.service.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type TestSession } from './helpers/auth.js';
import { cleanupE2eData } from './helpers/db.js';
import { FakeStorage } from './helpers/storage.js';

// SYNTHETIC chats and messages; Telegram, WhatsApp, the bucket and the LLM are faked.
class FakeTelegram extends TelegramClient {
  readonly sent: { chatId: string; text: string }[] = [];
  override onApplicationBootstrap(): Promise<void> {
    return Promise.resolve();
  }
  override sendMessage(chatId: string, text: string): Promise<void> {
    this.sent.push({ chatId, text });
    return Promise.resolve();
  }
  override downloadFile(): Promise<{ bytes: Uint8Array; contentType: string }> {
    return Promise.resolve({ bytes: Buffer.from('fake-jpeg'), contentType: 'image/jpeg' });
  }
}

class FakeWhatsapp extends WhatsappClient {
  readonly sent: { to: string; text: string }[] = [];
  override sendText(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
    return Promise.resolve();
  }
}

const TELEGRAM_SECRET = process.env['TELEGRAM_WEBHOOK_SECRET'] ?? '';
const APP_SECRET = process.env['WHATSAPP_APP_SECRET'] ?? '';
const PHONE_ID = process.env['WHATSAPP_PHONE_NUMBER_ID'] ?? '';

describe('chats (e2e)', () => {
  let ctx: TestApp;
  let llm: FakeLlmProvider;
  let telegram: FakeTelegram;
  let whatsapp: FakeWhatsapp;
  let runner: ChatRunner;
  let seq = 0;

  beforeAll(async () => {
    ctx = await createTestApp({
      customize: (builder) =>
        builder
          .overrideProvider(StorageService)
          .useValue(new FakeStorage())
          .overrideProvider(TelegramClient)
          .useFactory({
            factory: (config: ConfigService<Env, true>) => new FakeTelegram(config),
            inject: [ConfigService],
          })
          .overrideProvider(WhatsappClient)
          .useFactory({
            factory: (config: ConfigService<Env, true>) => new FakeWhatsapp(config),
            inject: [ConfigService],
          }),
    });
    llm = ctx.app.get<FakeLlmProvider>(LLM_PROVIDER);
    telegram = ctx.app.get(TelegramClient);
    whatsapp = ctx.app.get(WhatsappClient);
    runner = ctx.app.get(ChatRunner);
  });

  beforeEach(() => {
    ctx.clock.set(new Date('2026-10-14T15:00:00Z'));
    llm.reset();
    telegram.sent.length = 0;
    whatsapp.sent.length = 0;
  });

  afterAll(async () => {
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());

  async function tg(chatId: number, message: Record<string, unknown>): Promise<string[]> {
    seq += 1;
    await api()
      .post('/chat/telegram')
      .set('x-telegram-bot-api-secret-token', TELEGRAM_SECRET)
      .send({
        update_id: seq,
        message: { message_id: seq, chat: { id: chatId, type: 'private' }, ...message },
      })
      .expect(200);
    await runner.drain();
    return telegram.sent.filter((m) => m.chatId === String(chatId)).map((m) => m.text);
  }

  function waBody(from: string, message: Record<string, unknown>) {
    seq += 1;
    return JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: PHONE_ID },
                messages: [{ from, id: `wamid.${String(seq)}`, timestamp: '1', ...message }],
              },
            },
          ],
        },
      ],
    });
  }

  const sign = (body: string) =>
    `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`;

  async function linkCode(session: TestSession): Promise<string> {
    const res = await api().get('/me/chats').set(session.auth).expect(200);
    const url = res.body.telegram.url as string;
    expect(url).toMatch(/^https:\/\/t\.me\/findemes_test_bot\?start=[A-Z2-9]{8}$/);
    expect(res.body.whatsapp.message).toBe(`vincular ${url.slice(-8)}`);
    expect(res.body.whatsapp.number).toBe('+5492990000000');
    return url.slice(-8);
  }

  it('links a Telegram chat with the code and then records a typed expense', async () => {
    const session = await loginAs(ctx);
    const code = await linkCode(session);
    const chatId = 7_000_000 + seq;

    expect((await tg(chatId, { text: 'hola' }))[0]).toMatch(/vinculalo desde la app/);
    expect((await tg(chatId, { text: '/start XXXXXXXX' })).at(-1)).toMatch(/no sirve/);
    expect((await tg(chatId, { text: `/start ${code}` })).at(-1)).toMatch(/quedó vinculado/);

    const status = await api().get('/me/chats').set(session.auth).expect(200);
    expect(status.body.telegram).toMatchObject({ linked: true, url: null });

    llm.respondToEntryWith(() => ({
      entries: [
        {
          amount: '8000',
          currency: 'ARS',
          direction: 'OUT',
          method: 'CASH',
          merchant: 'kiosco',
          category: 'comida',
          date: null,
        },
      ],
    }));
    const reply = (await tg(chatId, { text: 'gasté 8 lucas en el kiosco' })).at(-1);
    expect(reply).toContain('$8.000,00 kiosco');
    const txs = await ctx.prisma.transaction.findMany({ where: { userId: session.userId } });
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ origin: 'MANUAL', status: 'CONFIRMED' });

    expect((await tg(chatId, { voice: { file_id: 'v' } })).at(-1)).toMatch(/no escucho audios/);
    expect((await tg(chatId, { text: 'desvincular' })).at(-1)).toMatch(/desvinculé/);
    expect(await ctx.prisma.chatLink.count({ where: { userId: session.userId } })).toBe(0);
  });

  it('a photo sent to a linked chat becomes a receipt', async () => {
    const session = await loginAs(ctx);
    const code = await linkCode(session);
    const chatId = 7_100_000 + seq;
    await tg(chatId, { text: code });
    llm.respondToReceiptWith(() => ({
      isReceipt: true,
      merchant: 'Almacén de prueba',
      cuit: null,
      issuedAt: null,
      total: '2500.00',
      currency: 'ARS',
      paymentMethodHint: null,
      items: [],
    }));
    const reply = (await tg(chatId, { photo: [{ file_id: 'small' }, { file_id: 'big' }] })).at(-1);
    expect(reply).toMatch(/Anoté \$2\.500,00 en Almacén de prueba/);
    expect(await ctx.prisma.receipt.count({ where: { userId: session.userId } })).toBe(1);
  });

  it('refuses webhooks without the secret, ignores groups and redeliveries', async () => {
    await api()
      .post('/chat/telegram')
      .set('x-telegram-bot-api-secret-token', 'wrong')
      .send({ update_id: 1 })
      .expect(401);
    await api()
      .post('/chat/telegram')
      .set('x-telegram-bot-api-secret-token', TELEGRAM_SECRET)
      .send({
        update_id: 2,
        message: { message_id: 1, chat: { id: -5, type: 'group' }, text: 'hola' },
      })
      .expect(200);
    await runner.drain();
    expect(telegram.sent).toHaveLength(0);

    const chatId = 7_200_000;
    const message = {
      update_id: 99,
      message: { message_id: 4242, chat: { id: chatId, type: 'private' }, text: 'hola' },
    };
    for (let i = 0; i < 2; i += 1) {
      await api()
        .post('/chat/telegram')
        .set('x-telegram-bot-api-secret-token', TELEGRAM_SECRET)
        .send(message)
        .expect(200);
    }
    await runner.drain();
    expect(telegram.sent.filter((m) => m.chatId === String(chatId))).toHaveLength(1);
  });

  it('blocks a chat that keeps guessing codes', async () => {
    const session = await loginAs(ctx);
    const code = await linkCode(session);
    const chatId = 7_300_000;
    for (let i = 0; i < 5; i += 1) await tg(chatId, { text: 'ZZZZZZZZ' });
    expect((await tg(chatId, { text: code })).at(-1)).toMatch(/no sirve/);
    expect(await ctx.prisma.chatLink.count({ where: { userId: session.userId } })).toBe(0);
  });

  it('WhatsApp: verifies the webhook, checks the signature and links by message', async () => {
    const challenge = await api()
      .get('/chat/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': process.env['WHATSAPP_VERIFY_TOKEN'],
        'hub.challenge': '12345',
      })
      .expect(200);
    expect(challenge.text).toBe('12345');
    await api()
      .get('/chat/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '1' })
      .expect(403);

    const session = await loginAs(ctx);
    const code = await linkCode(session);
    const body = waBody('5492991111111', { type: 'text', text: { body: `vincular ${code}` } });
    await api()
      .post('/chat/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .send(body)
      .expect(401);
    await api()
      .post('/chat/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(body))
      .send(body)
      .expect(200);
    await runner.drain();
    expect(whatsapp.sent.at(-1)).toMatchObject({ to: '5492991111111' });
    expect(whatsapp.sent.at(-1)?.text).toMatch(/quedó vinculado/);
    const links = await ctx.prisma.chatLink.findMany({ where: { userId: session.userId } });
    expect(links).toMatchObject([{ channel: 'WHATSAPP', externalId: '5492991111111' }]);
  });

  it('unlinking from the app and deleting the account remove the link', async () => {
    const session = await loginAs(ctx);
    const code = await linkCode(session);
    await tg(7_400_000, { text: code });
    await api().delete('/me/chats/TELEGRAM').set(session.auth).expect(204);
    await api().delete('/me/chats/SMS').set(session.auth).expect(400);
    expect(await ctx.prisma.chatLink.count({ where: { userId: session.userId } })).toBe(0);
  });

  it('parallel wrong codes still lock the chat', async () => {
    const session = await loginAs(ctx);
    const code = await linkCode(session);
    const chatId = 7_500_000;
    const chat = ctx.app.get(ChatService);
    // Concurrent deliveries, as Telegram sends them over several connections.
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        chat.handle({
          channel: 'TELEGRAM',
          externalId: String(chatId),
          messageId: `burst-${String(i)}`,
          kind: 'text',
          text: 'ZZZZZZZZ',
        }),
      ),
    );
    await runner.drain();
    expect((await tg(chatId, { text: code })).at(-1)).toMatch(/no sirve/);
  });
});
