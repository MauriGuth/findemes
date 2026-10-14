import { HttpException, Injectable, Logger } from '@nestjs/common';
import { type ChatChannel, formatMoney } from '@findemes/shared';

import { EntriesService } from '../entries/entries.service.js';
import { ReceiptsService } from '../receipts/receipts.service.js';
import { ChatLinkService } from './chat-link.service.js';

export interface IncomingChatMessage {
  channel: ChatChannel;
  /** Telegram chat id or WhatsApp wa_id. */
  externalId: string;
  /** For dedup: providers redeliver when they don't get a 200 in time. */
  messageId: string;
  kind: 'text' | 'image' | 'audio' | 'other';
  text: string | null;
  /** Downloads the photo from the provider; only called for linked chats. */
  fetchImage?: () => Promise<{ bytes: Uint8Array; contentType: string }>;
}

const WELCOME =
  'Hola, soy Findemes. Para usar este chat, vinculalo desde la app: Ajustes → Chats. Ahí vas a ver tu código.';
const HELP =
  'Mandame una foto de un ticket o escribime lo que gastaste ("gasté 8 lucas en el kiosco") y lo anoto. Para desvincular este chat, escribí "desvincular".';
const NO_AUDIO =
  'Por ahora no escucho audios: escribime lo que gastaste o mandame una foto del ticket.';
const WRONG_CODE =
  'Ese código no sirve o ya venció. Abrí Ajustes → Chats en la app para ver uno nuevo.';

const SEEN_MAX = 2000;

/**
 * The conversation, independent of the provider (ADR 014): linking, photos of tickets,
 * typed expenses. Replies are plain text in es-AR. Logs carry channel and outcome only.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly seen = new Set<string>();

  constructor(
    private readonly links: ChatLinkService,
    private readonly entries: EntriesService,
    private readonly receipts: ReceiptsService,
  ) {}

  /** Returns the reply to send, or null for a redelivered message. */
  async handle(message: IncomingChatMessage): Promise<string | null> {
    const seenKey = `${message.channel}:${message.messageId}`;
    if (this.seen.has(seenKey)) return null;
    this.seen.add(seenKey);
    if (this.seen.size > SEEN_MAX) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }

    const text = message.text?.trim() ?? '';
    let userId = await this.links.userFor(message.channel, message.externalId);
    if (!userId) {
      const code = ChatLinkService.findCode(text);
      if (!code) return WELCOME;
      userId = await this.links.linkByCode(message.channel, message.externalId, code);
      return userId ? `¡Listo! Este chat quedó vinculado a tu cuenta. ${HELP}` : WRONG_CODE;
    }

    try {
      if (message.kind === 'image' && message.fetchImage)
        return await this.receipt(userId, message);
      if (message.kind === 'audio') return NO_AUDIO;
      if (message.kind !== 'text' || !text) return HELP;
      const command = text.toLowerCase().replace(/^\//, '');
      if (command === 'desvincular') {
        await this.links.unlink(userId, message.channel);
        return 'Listo, desvinculé este chat. Podés volver a vincularlo desde la app.';
      }
      if (['start', 'ayuda', 'help', 'hola'].includes(command) || command.startsWith('start ')) {
        return HELP;
      }
      return await this.entry(userId, text.slice(0, 1000));
    } catch (error) {
      if (error instanceof HttpException) {
        const body = error.getResponse();
        const msg =
          typeof body === 'object' && body !== null && 'message' in body ? body.message : null;
        if (typeof msg === 'string') return msg;
      }
      this.logger.error(`chat.error channel=${message.channel}`);
      return 'Algo falló de nuestro lado. Probá de nuevo en un rato.';
    }
  }

  private async receipt(userId: string, message: IncomingChatMessage): Promise<string> {
    if (!this.receipts.enabled) return 'La lectura de tickets todavía no está disponible.';
    const image = await message.fetchImage?.();
    if (!image) return HELP;
    const receipt = await this.receipts.createFromImage(userId, image.bytes, image.contentType);
    this.logger.log(`chat.receipt channel=${message.channel} status=${receipt.status}`);
    if (receipt.status === 'FAILED' || !receipt.total) {
      return receipt.error ?? 'No pudimos leer el ticket. Probá con otra foto.';
    }
    const amount = formatMoney(receipt.total, { currency: receipt.currency });
    const where = receipt.merchant ? ` en ${receipt.merchant}` : '';
    return receipt.status === 'MATCHED'
      ? `Listo: sumé el detalle del ticket (${amount}${where}) al pago que ya tenías.`
      : `Anoté ${amount}${where}. Confirmalo en Pendientes de la app.`;
  }

  private async entry(userId: string, text: string): Promise<string> {
    const drafts = await this.entries.parse(userId, text);
    if (drafts.length === 0) {
      return 'No encontré ningún monto. Probá así: "gasté 8 lucas en el kiosco".';
    }
    const saved = await this.entries.save(userId, drafts);
    this.logger.log(`chat.entry count=${String(saved.length)}`);
    const lines = saved.map((tx) => {
      const sign = tx.direction === 'IN' ? '+' : '';
      return `• ${sign}${formatMoney(tx.amount, { currency: tx.currency })}${tx.merchantRaw ? ` ${tx.merchantRaw}` : ''}`;
    });
    const incomes = saved.some((tx) => tx.direction === 'IN');
    return [
      saved.length === 1 ? 'Anoté:' : `Anoté ${String(saved.length)} movimientos:`,
      ...lines,
      incomes ? 'Los ingresos te esperan en Pendientes para que me digas qué son.' : '',
      'Si algo está mal, corregilo en la app.',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
