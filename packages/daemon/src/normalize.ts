import { proto } from '@whiskeysockets/baileys';
import type { InboundChat, InboundContact, InboundMessage, InboundReaction } from './connector.js';

export interface NormalizedInbound {
  msg: InboundMessage;
  chat: InboundChat;
  contact: InboundContact;
}

export function normalizeBaileysMessage(m: proto.IWebMessageInfo): NormalizedInbound | null {
  const remoteJid = m.key?.remoteJid;
  const waMessageId = m.key?.id;
  if (!remoteJid || !waMessageId) return null;

  // Reactions are routed via normalizeBaileysReaction — callers should try that first.
  if (m.message?.reactionMessage) return null;

  const extracted = extractContent(m.message);
  if (!extracted) return null;

  const isGroup = remoteJid.endsWith('@g.us');
  const senderJid = isGroup ? (m.key?.participant ?? remoteJid) : m.key?.fromMe ? 'me' : remoteJid;

  const ts = new Date(Number(m.messageTimestamp ?? 0) * 1000);
  const ctx =
    m.message?.extendedTextMessage?.contextInfo ??
    m.message?.imageMessage?.contextInfo ??
    m.message?.videoMessage?.contextInfo ??
    m.message?.audioMessage?.contextInfo ??
    m.message?.documentMessage?.contextInfo ??
    m.message?.stickerMessage?.contextInfo ??
    undefined;
  const quotedWaId = ctx?.stanzaId ?? undefined;

  return {
    msg: {
      waMessageId,
      chatJid: remoteJid,
      senderJid,
      fromMe: !!m.key?.fromMe,
      ts,
      kind: extracted.kind,
      text: extracted.text,
      quotedWaId,
      media: extracted.media,
      deletedAt: extracted.deletedAt,
    },
    chat: {
      jid: remoteJid,
      type: isGroup ? 'group' : remoteJid.endsWith('@newsletter') ? 'newsletter' : 'dm',
    },
    contact: {
      jid: senderJid === 'me' ? remoteJid : senderJid,
      pushName: m.pushName ?? undefined,
    },
  };
}

export function normalizeBaileysReaction(m: proto.IWebMessageInfo): InboundReaction | null {
  const r = m.message?.reactionMessage;
  if (!r?.key?.id) return null;
  const remoteJid = m.key?.remoteJid;
  if (!remoteJid) return null;
  const senderJid = remoteJid.endsWith('@g.us')
    ? (m.key?.participant ?? remoteJid)
    : m.key?.fromMe
      ? 'me'
      : remoteJid;
  return {
    chatJid: remoteJid,
    targetWaMessageId: r.key.id,
    reactorJid: senderJid,
    emoji: r.text ?? '',
    ts: new Date(Number(m.messageTimestamp ?? 0) * 1000),
  };
}

interface ExtractedContent {
  kind: InboundMessage['kind'];
  text: string | null;
  media?: InboundMessage['media'];
  deletedAt?: Date;
}

function extractContent(msg: proto.IMessage | null | undefined): ExtractedContent | null {
  if (!msg) return null;

  if (msg.conversation != null && msg.conversation.length > 0) {
    return { kind: 'text', text: msg.conversation };
  }
  if (msg.extendedTextMessage?.text != null) {
    return { kind: 'text', text: msg.extendedTextMessage.text };
  }
  if (msg.imageMessage) {
    return {
      kind: 'image',
      text: msg.imageMessage.caption ?? null,
      media: mediaFromImage(msg.imageMessage),
    };
  }
  if (msg.videoMessage) {
    return {
      kind: 'video',
      text: msg.videoMessage.caption ?? null,
      media: mediaFromVideo(msg.videoMessage),
    };
  }
  if (msg.audioMessage) {
    return { kind: 'audio', text: null, media: mediaFromAudio(msg.audioMessage) };
  }
  if (msg.documentMessage) {
    return {
      kind: 'document',
      text: msg.documentMessage.fileName ?? null,
      media: mediaFromDocument(msg.documentMessage),
    };
  }
  if (msg.stickerMessage) {
    return { kind: 'sticker', text: null, media: mediaFromSticker(msg.stickerMessage) };
  }
  if (msg.protocolMessage) {
    if (msg.protocolMessage.type === proto.Message.ProtocolMessage.Type.REVOKE) {
      return { kind: 'system', text: 'message deleted', deletedAt: new Date() };
    }
    // Other protocol messages (ephemeral settings, key share, history sync, etc.) — skip.
    return null;
  }
  return null;
}

function mediaFromImage(im: proto.Message.IImageMessage): InboundMessage['media'] {
  return {
    mime: im.mimetype ?? 'image/jpeg',
    sizeBytes: Number(im.fileLength ?? 0),
    width: nullToUndef(im.width),
    height: nullToUndef(im.height),
    directPath: im.directPath ?? undefined,
    mediaKey: bytesToBase64(im.mediaKey),
  };
}

function mediaFromVideo(v: proto.Message.IVideoMessage): InboundMessage['media'] {
  return {
    mime: v.mimetype ?? 'video/mp4',
    sizeBytes: Number(v.fileLength ?? 0),
    width: nullToUndef(v.width),
    height: nullToUndef(v.height),
    durationMs: v.seconds != null ? v.seconds * 1000 : undefined,
    directPath: v.directPath ?? undefined,
    mediaKey: bytesToBase64(v.mediaKey),
  };
}

function mediaFromAudio(a: proto.Message.IAudioMessage): InboundMessage['media'] {
  return {
    mime: a.mimetype ?? 'audio/ogg',
    sizeBytes: Number(a.fileLength ?? 0),
    durationMs: a.seconds != null ? a.seconds * 1000 : undefined,
    directPath: a.directPath ?? undefined,
    mediaKey: bytesToBase64(a.mediaKey),
  };
}

function mediaFromDocument(d: proto.Message.IDocumentMessage): InboundMessage['media'] {
  return {
    mime: d.mimetype ?? 'application/octet-stream',
    sizeBytes: Number(d.fileLength ?? 0),
    fileName: d.fileName ?? undefined,
    directPath: d.directPath ?? undefined,
    mediaKey: bytesToBase64(d.mediaKey),
  };
}

function mediaFromSticker(s: proto.Message.IStickerMessage): InboundMessage['media'] {
  return {
    mime: s.mimetype ?? 'image/webp',
    sizeBytes: Number(s.fileLength ?? 0),
    width: nullToUndef(s.width),
    height: nullToUndef(s.height),
    directPath: s.directPath ?? undefined,
    mediaKey: bytesToBase64(s.mediaKey),
  };
}

function nullToUndef(v: number | null | undefined): number | undefined {
  return v == null ? undefined : v;
}

function bytesToBase64(b: Uint8Array | null | undefined): string | undefined {
  if (!b || b.length === 0) return undefined;
  return Buffer.from(b).toString('base64');
}
