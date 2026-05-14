import type { TypedEventEmitter } from './typed-emitter.js';

export type ChatType = 'dm' | 'group';

export interface InboundContact {
  jid: string;
  pushName?: string;
  businessName?: string;
}

export interface InboundChat {
  jid: string;
  type: ChatType;
  subject?: string;
}

export interface InboundMessage {
  waMessageId: string;
  chatJid: string;
  senderJid: string;
  fromMe: boolean;
  ts: Date;
  text: string;
  quotedWaId?: string;
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
  status: (info: OutboundStatus) => void;
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
}
