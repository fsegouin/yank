import { proto } from '@whiskeysockets/baileys';
import type {
  InboundChat,
  InboundContact,
  InboundDeletion,
  InboundMessage,
  InboundReaction,
} from './connector.js';

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
  // Deletions are routed via normalizeBaileysDeletion.
  if (m.message?.protocolMessage?.type === proto.Message.ProtocolMessage.Type.REVOKE) return null;

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

export function normalizeBaileysDeletion(m: proto.IWebMessageInfo): InboundDeletion | null {
  const protocolMsg = m.message?.protocolMessage;
  if (!protocolMsg) return null;
  if (protocolMsg.type !== proto.Message.ProtocolMessage.Type.REVOKE) return null;
  const targetWaMessageId = protocolMsg.key?.id;
  const chatJid = m.key?.remoteJid;
  if (!targetWaMessageId || !chatJid) return null;
  return {
    chatJid,
    targetWaMessageId,
    ts: new Date(Number(m.messageTimestamp ?? 0) * 1000),
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
    // REVOKE is routed via normalizeBaileysDeletion (handled by the caller before
    // calling extractContent). Other protocol messages (ephemeral settings, key
    // share, history sync, etc.) — skip.
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
    url: im.url ?? undefined,
    fileSha256: bytesToBase64(im.fileSha256),
    fileEncSha256: bytesToBase64(im.fileEncSha256),
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
    url: v.url ?? undefined,
    fileSha256: bytesToBase64(v.fileSha256),
    fileEncSha256: bytesToBase64(v.fileEncSha256),
  };
}

function mediaFromAudio(a: proto.Message.IAudioMessage): InboundMessage['media'] {
  return {
    mime: a.mimetype ?? 'audio/ogg',
    sizeBytes: Number(a.fileLength ?? 0),
    durationMs: a.seconds != null ? a.seconds * 1000 : undefined,
    directPath: a.directPath ?? undefined,
    mediaKey: bytesToBase64(a.mediaKey),
    url: a.url ?? undefined,
    fileSha256: bytesToBase64(a.fileSha256),
    fileEncSha256: bytesToBase64(a.fileEncSha256),
  };
}

function mediaFromDocument(d: proto.Message.IDocumentMessage): InboundMessage['media'] {
  return {
    mime: d.mimetype ?? 'application/octet-stream',
    sizeBytes: Number(d.fileLength ?? 0),
    fileName: d.fileName ?? undefined,
    directPath: d.directPath ?? undefined,
    mediaKey: bytesToBase64(d.mediaKey),
    url: d.url ?? undefined,
    fileSha256: bytesToBase64(d.fileSha256),
    fileEncSha256: bytesToBase64(d.fileEncSha256),
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
    url: s.url ?? undefined,
    fileSha256: bytesToBase64(s.fileSha256),
    fileEncSha256: bytesToBase64(s.fileEncSha256),
  };
}

function nullToUndef(v: number | null | undefined): number | undefined {
  return v == null ? undefined : v;
}

function bytesToBase64(b: Uint8Array | null | undefined): string | undefined {
  if (!b || b.length === 0) return undefined;
  return Buffer.from(b).toString('base64');
}

export interface InboundEdit {
  chatJid: string;
  targetWaMessageId: string;
  text: string;
  ts: Date;
}

export function normalizeBaileysEdit(m: proto.IWebMessageInfo): InboundEdit | null {
  const protocolMsg = m.message?.protocolMessage;
  if (!protocolMsg) return null;
  if (protocolMsg.type !== proto.Message.ProtocolMessage.Type.MESSAGE_EDIT) return null;
  const targetWaMessageId = protocolMsg.key?.id;
  const chatJid = m.key?.remoteJid;
  if (!targetWaMessageId || !chatJid) return null;
  const editedMsg = protocolMsg.editedMessage;
  const text =
    editedMsg?.conversation ??
    editedMsg?.extendedTextMessage?.text ??
    null;
  if (!text) return null;
  return {
    chatJid,
    targetWaMessageId,
    text,
    ts: new Date(Number(m.messageTimestamp ?? 0) * 1000),
  };
}
