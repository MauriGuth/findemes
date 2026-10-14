import { z } from 'zod';

const Contact = z.looseObject({
  Email: z.string(),
  Name: z.string().optional(),
  MailboxHash: z.string().optional(),
});

/**
 * The fields of Postmark's inbound webhook we use
 * (https://postmarkapp.com/developer/user-guide/inbound/parse-an-email). Everything else
 * is ignored; nothing here is trusted beyond its shape.
 */
export const PostmarkInboundSchema = z.looseObject({
  MessageID: z.string().min(1),
  From: z.string().default(''),
  FromFull: Contact.optional(),
  OriginalRecipient: z.string().optional(),
  MailboxHash: z.string().optional(),
  ToFull: z.array(Contact).optional(),
  Subject: z.string().default(''),
  Date: z.string().optional(),
  TextBody: z.string().default(''),
  HtmlBody: z.string().default(''),
  Attachments: z
    .array(
      z.looseObject({
        Name: z.string().default('adjunto'),
        Content: z.string().default(''),
        ContentType: z.string().default(''),
        ContentLength: z.number().default(0),
      }),
    )
    .default([]),
});
export type PostmarkInbound = z.infer<typeof PostmarkInboundSchema>;
