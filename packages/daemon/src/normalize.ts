import type { proto } from '@whiskeysockets/baileys';
import type { InboundChat, InboundContact, InboundMessage } from './connector.js';

export interface NormalizedInbound {
  msg: InboundMessage;
  chat: InboundChat;
  contact: InboundContact;
}

export function normalizeBaileysMessage(m: proto.IWebMessageInfo): NormalizedInbound | null {
  const remoteJid = m.key?.remoteJid;
  const waMessageId = m.key?.id;
  if (!remoteJid || !waMessageId) return null;

  const text = extractText(m.message);
  if (text == null) return null;

  const isGroup = remoteJid.endsWith('@g.us');
  const senderJid = isGroup
    ? (m.key?.participant ?? remoteJid)
    : m.key?.fromMe
      ? 'me'
      : remoteJid;

  const ts = new Date(Number(m.messageTimestamp ?? 0) * 1000);
  const ctx = m.message?.extendedTextMessage?.contextInfo;
  const quotedWaId = ctx?.stanzaId ?? undefined;

  return {
    msg: {
      waMessageId,
      chatJid: remoteJid,
      senderJid,
      fromMe: !!m.key?.fromMe,
      ts,
      text,
      quotedWaId,
    },
    chat: { jid: remoteJid, type: isGroup ? 'group' : 'dm' },
    contact: {
      jid: senderJid === 'me' ? remoteJid : senderJid,
      pushName: m.pushName ?? undefined,
    },
  };
}

function extractText(msg: proto.IMessage | null | undefined): string | null {
  if (!msg) return null;
  if (msg.conversation != null) return msg.conversation;
  if (msg.extendedTextMessage?.text != null) return msg.extendedTextMessage.text;
  return null;
}
