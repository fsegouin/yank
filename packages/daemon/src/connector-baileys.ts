import {
  default as makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from '@whiskeysockets/baileys';
import type { Boom } from '@hapi/boom';
import { TypedEmitter } from './typed-emitter.js';
import type {
  Connector,
  ConnectorEvents,
  InboundGroupMember,
  SendArgs,
  SendResult,
} from './connector.js';
import {
  normalizeBaileysDeletion,
  normalizeBaileysMessage,
  normalizeBaileysReaction,
} from './normalize.js';
import { loadAuthState } from './auth-state.js';

export interface BaileysConnectorOpts {
  authDir: string;
  userId: string;
}

export class BaileysConnector extends TypedEmitter<ConnectorEvents> implements Connector {
  private sock: WASocket | null = null;
  private lastQr: string | null = null;
  private auth!: Awaited<ReturnType<typeof loadAuthState>>;
  private reconnectMs = 1000;
  private syncIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private syncCompleted = false;
  private historySynced = 0;
  // JIDs we've already requested group metadata for this session — avoid repeats.
  private groupMetaRequested = new Set<string>();

  constructor(private opts: BaileysConnectorOpts) {
    super();
  }

  async start(): Promise<void> {
    this.auth = await loadAuthState(this.opts.authDir, this.opts.userId);
    await this.connect();
  }

  private async connect(): Promise<void> {
    this.syncCompleted = false;
    this.historySynced = 0;
    this.groupMetaRequested.clear();
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
      version,
      auth: this.auth.state,
      printQRInTerminal: false,
      syncFullHistory: true,
    });
    this.sock = sock;

    sock.ev.on('creds.update', this.auth.saveCreds);

    sock.ev.on('connection.update', (u) => {
      if (u.qr) {
        this.lastQr = u.qr;
        this.emit('qr', u.qr);
      }
      if (u.connection === 'open') {
        this.lastQr = null;
        // Safety net: if no messaging-history.set events fire within 30s, mark sync complete.
        if (this.syncIdleTimer) clearTimeout(this.syncIdleTimer);
        this.syncIdleTimer = setTimeout(() => {
          if (this.syncCompleted) return;
          this.syncCompleted = true;
          this.emit('history-complete');
        }, 30_000);
        const jid = sock.user?.id ?? '';
        this.emit('open', { jid, phone: jid.replace(/:\d+@.+$/, '') });
        this.reconnectMs = 1000;
      }
      if (u.connection === 'close') {
        if (this.syncIdleTimer) clearTimeout(this.syncIdleTimer);
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
      // Chats first — so subjects exist before messages reference them.
      for (const c of h.chats ?? []) {
        if (!c.id) continue;
        const t = c as { id: string; name?: string | null; subject?: string | null };
        const subject = t.name ?? t.subject ?? undefined;
        if (subject != null) {
          this.emit('chat', {
            jid: c.id,
            type: c.id.endsWith('@g.us')
              ? 'group'
              : c.id.endsWith('@newsletter')
                ? 'newsletter'
                : 'dm',
            subject,
          });
        }
        // Backfill group membership snapshot — fire-and-forget so history sync isn't blocked.
        this.requestGroupMembers(c.id);
      }

      // Contacts — address-book display names from history payload.
      for (const c of h.contacts ?? []) {
        if (!c.id) continue;
        const t = c as {
          id: string;
          name?: string | null;
          notify?: string | null;
          verifiedName?: string | null;
        };
        const displayName = t.name ?? undefined;
        const pushName = t.notify ?? undefined;
        const businessName = t.verifiedName ?? undefined;
        if (!displayName && !pushName && !businessName) continue;
        this.emit('contact', { jid: c.id, displayName, pushName, businessName });
      }

      // Ingest the history batch via the same path as live messages.
      for (const m of h.messages ?? []) {
        const del = normalizeBaileysDeletion(m);
        if (del) {
          this.emit('delete', del);
          continue;
        }
        const reaction = normalizeBaileysReaction(m);
        if (reaction) {
          this.emit('reaction', reaction);
          continue;
        }
        const r = normalizeBaileysMessage(m);
        if (!r) continue;
        this.emit('message', r.msg, r.chat, r.contact);
      }
      const batchSize = h.messages?.length ?? 0;
      this.historySynced += batchSize;
      this.emit('history-progress', { synced: this.historySynced });
      if (h.isLatest) {
        this.syncCompleted = true;
        if (this.syncIdleTimer) clearTimeout(this.syncIdleTimer);
        this.emit('history-complete');
        return;
      }
      // Reset the idle timer; emit history-complete if no further history events for 10s.
      if (this.syncIdleTimer) clearTimeout(this.syncIdleTimer);
      this.syncIdleTimer = setTimeout(() => {
        if (this.syncCompleted) return;
        this.syncCompleted = true;
        this.emit('history-complete');
      }, 10_000);
    });

    sock.ev.on('messages.upsert', ({ messages: msgs }) => {
      for (const m of msgs) {
        const del = normalizeBaileysDeletion(m);
        if (del) {
          this.emit('delete', del);
          continue;
        }
        const reaction = normalizeBaileysReaction(m);
        if (reaction) {
          this.emit('reaction', reaction);
          continue;
        }
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

    sock.ev.on('messages.reaction', (reactions) => {
      for (const r of reactions) {
        if (!r.key?.id || !r.reaction?.key?.id) continue;
        const remoteJid = r.key.remoteJid;
        if (!remoteJid) continue;
        const reactorJid = remoteJid.endsWith('@g.us')
          ? (r.key.participant ?? remoteJid)
          : r.key.fromMe
            ? 'me'
            : remoteJid;
        this.emit('reaction', {
          chatJid: remoteJid,
          targetWaMessageId: r.reaction.key.id,
          reactorJid,
          emoji: r.reaction.text ?? '',
          ts: new Date(),
        });
      }
    });

    sock.ev.on('message-receipt.update', (updates) => {
      for (const u of updates) {
        if (!u.key?.id) continue;
        const readMs = u.receipt?.readTimestamp;
        const recvMs = u.receipt?.receiptTimestamp;
        const ts = readMs
          ? new Date(Number(readMs) * 1000)
          : recvMs
            ? new Date(Number(recvMs) * 1000)
            : new Date();
        const status: 'delivered' | 'read' = readMs ? 'read' : 'delivered';
        this.emit('receipt', {
          waMessageId: u.key.id,
          status,
          participantJid: u.key.participant ?? undefined,
          ts,
        });
      }
    });

    sock.ev.on('presence.update', ({ presences }) => {
      for (const [jid, p] of Object.entries(presences ?? {})) {
        if (!p?.lastKnownPresence) continue;
        this.emit('presence', {
          jid,
          status: p.lastKnownPresence,
          lastSeen: p.lastSeen ? new Date(p.lastSeen * 1000) : undefined,
        });
      }
    });

    sock.ev.on('group-participants.update', (event) => {
      // Refresh the full membership snapshot whenever participants change. We always
      // bypass the throttle here because participants actually changed.
      this.groupMetaRequested.delete(event.id);
      this.requestGroupMembers(event.id);
    });

    sock.ev.on('chats.upsert', (chats) => {
      for (const c of chats) {
        if (!c.id) continue;
        const meta = c as { name?: string | null; subject?: string | null };
        this.emit('chat', {
          jid: c.id,
          type: c.id.endsWith('@g.us')
            ? 'group'
            : c.id.endsWith('@newsletter')
              ? 'newsletter'
              : 'dm',
          subject: meta.name ?? meta.subject ?? undefined,
        });
        this.requestGroupMembers(c.id);
      }
    });

    sock.ev.on('chats.update', (updates) => {
      for (const u of updates) {
        if (!u.id) continue;
        // chats.update is partial — only emit if there's a name/subject change.
        const meta = u as { name?: string | null; subject?: string | null };
        const subject = meta.name ?? meta.subject;
        if (subject == null) continue;
        this.emit('chat', {
          jid: u.id,
          type: u.id.endsWith('@g.us')
            ? 'group'
            : u.id.endsWith('@newsletter')
              ? 'newsletter'
              : 'dm',
          subject,
        });
      }
    });

    sock.ev.on('contacts.upsert', (contactsList) => {
      for (const c of contactsList) {
        if (!c.id) continue;
        const t = c as {
          id: string;
          name?: string | null;
          notify?: string | null;
          verifiedName?: string | null;
        };
        const displayName = t.name ?? undefined;
        const pushName = t.notify ?? undefined;
        const businessName = t.verifiedName ?? undefined;
        if (!displayName && !pushName && !businessName) continue;
        this.emit('contact', { jid: c.id, displayName, pushName, businessName });
      }
    });

    sock.ev.on('contacts.update', (updates) => {
      for (const u of updates) {
        if (!u.id) continue;
        const t = u as {
          id: string;
          name?: string | null;
          notify?: string | null;
          verifiedName?: string | null;
        };
        const displayName = t.name ?? undefined;
        const pushName = t.notify ?? undefined;
        const businessName = t.verifiedName ?? undefined;
        if (!displayName && !pushName && !businessName) continue;
        this.emit('contact', { jid: u.id, displayName, pushName, businessName });
      }
    });
  }

  /**
   * Fire-and-forget request for a group's participant list. Skips if it's not a group
   * JID or if we've already requested this session. Failures (no access etc.) are silent.
   */
  private requestGroupMembers(jid: string): void {
    if (!jid.endsWith('@g.us')) return;
    if (this.groupMetaRequested.has(jid)) return;
    this.groupMetaRequested.add(jid);
    const sock = this.sock;
    if (!sock) return;
    void sock
      .groupMetadata(jid)
      .then((metadata) => {
        if (!metadata?.participants) return;
        const members: InboundGroupMember[] = metadata.participants.map((p) => {
          const admin = p.admin;
          const role: InboundGroupMember['role'] =
            admin === 'superadmin' ? 'superadmin' : admin === 'admin' ? 'admin' : 'member';
          return { jid: p.id, role };
        });
        this.emit('group-members', jid, members);
      })
      .catch(() => {
        // No access / network blip — drop the throttle marker so a future event can retry.
        this.groupMetaRequested.delete(jid);
      });
  }

  async requestPair(method: 'qr' | 'code', phoneNumber?: string): Promise<void> {
    if (method === 'qr') {
      if (this.lastQr) this.emit('qr', this.lastQr);
      return;
    }
    if (!this.sock) throw new Error('connector not started');
    if (!phoneNumber) throw new Error('phoneNumber required for pair-code flow');
    if (!this.sock.authState.creds.registered) {
      await this.sock.waitForConnectionUpdate(async (u) => Boolean(u.qr));
    }
    const code = await this.sock.requestPairingCode(phoneNumber);
    this.emit('pairing-code', code);
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

  isRegistered(): boolean {
    return Boolean(this.auth?.state?.creds?.registered);
  }
}
