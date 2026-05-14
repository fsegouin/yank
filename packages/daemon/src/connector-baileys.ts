import {
  default as makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from '@whiskeysockets/baileys';
import type { Boom } from '@hapi/boom';
import { TypedEmitter } from './typed-emitter.js';
import type { Connector, ConnectorEvents, SendArgs, SendResult } from './connector.js';
import { normalizeBaileysMessage } from './normalize.js';
import { loadAuthState } from './auth-state.js';

export interface BaileysConnectorOpts {
  authDir: string;
  userId: string;
}

export class BaileysConnector extends TypedEmitter<ConnectorEvents> implements Connector {
  private sock: WASocket | null = null;
  private auth!: Awaited<ReturnType<typeof loadAuthState>>;
  private reconnectMs = 1000;

  constructor(private opts: BaileysConnectorOpts) {
    super();
  }

  async start(): Promise<void> {
    this.auth = await loadAuthState(this.opts.authDir, this.opts.userId);
    await this.connect();
  }

  private async connect(): Promise<void> {
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: this.auth.state, printQRInTerminal: false });
    this.sock = sock;

    sock.ev.on('creds.update', this.auth.saveCreds);

    sock.ev.on('connection.update', (u) => {
      if (u.qr) this.emit('qr', u.qr);
      if (u.connection === 'open') {
        const jid = sock.user?.id ?? '';
        this.emit('open', { jid, phone: jid.replace(/:\d+@.+$/, '') });
        this.reconnectMs = 1000;
      }
      if (u.connection === 'close') {
        const code = (u.lastDisconnect?.error as Boom)?.output?.statusCode;
        const willReconnect = code !== DisconnectReason.loggedOut;
        this.emit('close', { reason: String(code), willReconnect });
        if (willReconnect) {
          setTimeout(() => this.connect().catch(() => {}), this.reconnectMs);
          this.reconnectMs = Math.min(this.reconnectMs * 2, 60_000);
        }
      }
    });

    sock.ev.on('messaging-history.set', (h) => {
      this.emit('history-progress', { synced: h.messages?.length ?? 0 });
      if (h.isLatest) this.emit('history-complete');
    });

    sock.ev.on('messages.upsert', ({ messages: msgs }) => {
      for (const m of msgs) {
        const r = normalizeBaileysMessage(m);
        if (!r) continue;
        this.emit('message', r.msg, r.chat, r.contact);
      }
    });

    sock.ev.on('messages.update', (updates) => {
      for (const u of updates) {
        const id = u.key?.id;
        if (!id) continue;
        const s = u.update?.status;
        if (s === 2) this.emit('status', { waMessageId: id, status: 'sent' });
        else if (s === 3) this.emit('status', { waMessageId: id, status: 'delivered' });
        else if (s === 4) this.emit('status', { waMessageId: id, status: 'read' });
      }
    });
  }

  async requestPair(method: 'qr' | 'code'): Promise<void> {
    if (method === 'code') {
      const phone = this.sock?.user?.id;
      if (!phone) throw new Error('cannot request pairing code before connection start');
      const code = await this.sock!.requestPairingCode(phone);
      this.emit('pairing-code', code);
    }
  }

  async sendText(args: SendArgs): Promise<SendResult> {
    if (!this.sock) throw new Error('connector not started');
    const sent = await this.sock.sendMessage(args.chatJid, {
      text: args.text,
      ...(args.quotedWaId ? { contextInfo: { stanzaId: args.quotedWaId } } : {}),
    });
    if (!sent?.key?.id) throw new Error('sendMessage returned no key.id');
    return {
      waMessageId: sent.key.id,
      ts: new Date(Number(sent.messageTimestamp ?? 0) * 1000 || Date.now()),
    };
  }

  async close(): Promise<void> {
    this.sock?.end(undefined);
  }
}
