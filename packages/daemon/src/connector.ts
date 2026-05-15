import type { TypedEventEmitter } from './typed-emitter.js';
import type { InboundEdit } from './normalize.js';

export type { InboundEdit } from './normalize.js';

export type ChatType = 'dm' | 'group' | 'community' | 'newsletter';

export interface InboundContact {
  jid: string;
  pushName?: string;
  businessName?: string;
  displayName?: string;
}

export interface InboundChat {
  jid: string;
  type: ChatType;
  subject?: string;
}

export interface InboundMedia {
  mime: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
  fileName?: string;
  // URL pointers — actual download deferred until media-worker / lazy fetch.
  directPath?: string;
  mediaKey?: string; // base64; Baileys uses these to decrypt later
  url?: string; // optional CDN URL Baileys may have at ingest time
  fileSha256?: string; // base64; needed to refresh URL via reuploadRequest
  fileEncSha256?: string; // base64; needed to refresh URL via reuploadRequest
}

export interface InboundMessage {
  waMessageId: string;
  chatJid: string;
  senderJid: string;
  fromMe: boolean;
  ts: Date;
  kind: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'system';
  text: string | null;
  quotedWaId?: string;
  media?: InboundMedia;
  deletedAt?: Date;
}

export interface InboundReaction {
  chatJid: string;
  targetWaMessageId: string;
  reactorJid: string;
  emoji: string; // empty string means removed
  ts: Date;
}

export interface InboundDeletion {
  chatJid: string;
  targetWaMessageId: string;
  ts: Date;
}

export type PresenceStatus = 'available' | 'unavailable' | 'composing' | 'paused' | 'recording';

export interface InboundPresence {
  jid: string;
  status: PresenceStatus;
  lastSeen?: Date;
}

export type GroupMemberRole = 'member' | 'admin' | 'superadmin';

export interface InboundGroupMember {
  jid: string;
  role: GroupMemberRole;
}

export interface InboundReceipt {
  waMessageId: string;
  status: 'delivered' | 'read';
  participantJid?: string;
  ts: Date;
}

export interface OutboundStatus {
  waMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
}

export interface ConnectorEvents {
  qr: (data: string) => void;
  'pairing-code': (code: string) => void;
  open: (info: { jid: string; phone: string }) => void;
  close: (info: { reason?: string; willReconnect: boolean }) => void;
  'history-progress': (info: { synced: number; total?: number }) => void;
  'history-complete': () => void;
  message: (msg: InboundMessage, chat: InboundChat, contact: InboundContact) => void;
  chat: (chat: InboundChat) => void;
  contact: (contact: InboundContact) => void;
  status: (info: OutboundStatus) => void;
  reaction: (reaction: InboundReaction) => void;
  delete: (deletion: InboundDeletion) => void;
  edit: (edit: InboundEdit) => void;
  presence: (update: InboundPresence) => void;
  'group-members': (chatJid: string, members: InboundGroupMember[]) => void;
  receipt: (receipt: InboundReceipt) => void;
}

export interface SendArgs {
  chatJid: string;
  text: string;
  quotedWaId?: string;
}

export interface SendResult {
  waMessageId: string;
  ts: Date;
}

export interface Connector extends TypedEventEmitter<ConnectorEvents> {
  start(): Promise<void>;
  requestPair(method: 'qr' | 'code', phoneNumber?: string): Promise<void>;
  sendText(args: SendArgs): Promise<SendResult>;
  close(): Promise<void>;
  /** Returns true when the connector has loaded auth state and the device is registered with WA. */
  isRegistered(): boolean;
  /**
   * Force a group metadata refresh for the given JID. Fire-and-forget; results
   * arrive via 'chat' + 'group-members' events. Throttled internally per-JID.
   */
  refreshGroup(jid: string): void;
  /**
   * Download (and refresh URL if needed) the media bytes for a previously-ingested
   * message. Uses Baileys' `reuploadRequest` hook to recover from stale `directPath`s.
   */
  downloadMedia(args: DownloadMediaArgs): Promise<Buffer>;
  /**
   * Edit an already-sent WhatsApp message. Sends Baileys' protocolMessage EDIT.
   * Throws if the message is too old (>15 min on WA's servers), the socket is
   * disconnected, or the message type is unsupported.
   */
  editMessage(chatJid: string, waMessageId: string, text: string): Promise<void>;
}

export interface DownloadMediaArgs {
  waMessageId: string;
  chatJid: string;
  fromMe: boolean;
  kind: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  media: {
    mime: string;
    sizeBytes: number;
    directPath?: string;
    mediaKey?: string; // base64
    url?: string;
    fileSha256?: string; // base64
    fileEncSha256?: string; // base64
  };
}
