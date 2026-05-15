import { TypedEmitter } from './typed-emitter.js';
import type {
  Connector,
  ConnectorEvents,
  DownloadMediaArgs,
  InboundChat,
  InboundContact,
  InboundGroupMember,
  InboundMessage,
  InboundPresence,
  InboundReaction,
  InboundReceipt,
  OutboundStatus,
  SendArgs,
  SendResult,
} from './connector.js';

export class FakeConnector extends TypedEmitter<ConnectorEvents> implements Connector {
  sent: Array<{ chatJid: string; text: string; quotedWaId?: string }> = [];
  private seq = 0;

  async start(): Promise<void> {}

  async requestPair(method: 'qr' | 'code', _phoneNumber?: string): Promise<void> {
    if (method === 'qr') this.emit('qr', 'fake-qr-payload');
    else this.emit('pairing-code', 'FX3-M9A-K2P');
  }

  async sendText(args: SendArgs): Promise<SendResult> {
    this.sent.push({ chatJid: args.chatJid, text: args.text, quotedWaId: args.quotedWaId });
    const r: SendResult = { waMessageId: `fake-${++this.seq}`, ts: new Date() };
    setImmediate(() => this.emit('status', { waMessageId: r.waMessageId, status: 'sent' }));
    return r;
  }

  async close(): Promise<void> {}

  isRegistered(): boolean {
    return false;
  }

  refreshGroup(_jid: string): void {
    // no-op
  }

  async downloadMedia(_args: DownloadMediaArgs): Promise<Buffer> {
    throw new Error('FakeConnector.downloadMedia not implemented');
  }

  /* Test helpers */
  simulatePair(info: { jid: string; phone: string }): void {
    this.emit('open', info);
  }
  pushMessage(msg: InboundMessage, chat: InboundChat, contact: InboundContact): void {
    this.emit('message', msg, chat, contact);
  }
  simulateStatus(s: OutboundStatus): void {
    this.emit('status', s);
  }
  simulateHistory(synced: number, total?: number): void {
    this.emit('history-progress', { synced, total });
  }
  completeHistory(): void {
    this.emit('history-complete');
  }
  pushReaction(r: InboundReaction): void {
    this.emit('reaction', r);
  }
  pushPresence(p: InboundPresence): void {
    this.emit('presence', p);
  }
  pushGroupMembers(chatJid: string, members: InboundGroupMember[]): void {
    this.emit('group-members', chatJid, members);
  }
  pushReceipt(r: InboundReceipt): void {
    this.emit('receipt', r);
  }
}
