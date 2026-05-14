export interface Chat {
  id: string;
  jid: string;
  type: 'dm' | 'group' | 'community' | 'newsletter';
  subject: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  workspace: 'work' | 'personal' | 'triage' | 'hidden' | null;
}

export interface Message {
  id: string;
  chatId: string;
  waMessageId: string | null;
  senderJid: string;
  ts: string;
  kind: string;
  text: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
}

export interface SetupStatus {
  status: 'unlinked' | 'pairing' | 'connected' | 'disconnected';
  jid?: string | null;
  phone?: string | null;
  lastConnectedAt?: string | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  listChats: () => fetch('/api/chats').then(json<Chat[]>),
  getChat: (id: string) => fetch(`/api/chats/${id}`).then(json<Chat>),
  listMessages: (chatId: string) =>
    fetch(`/api/chats/${chatId}/messages`).then(json<Message[]>),
  sendMessage: (chatId: string, text: string) =>
    fetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(json<Message>),
  setupStatus: () => fetch('/api/setup/status').then(json<SetupStatus>),
  setupLink: (method: 'qr' | 'code' = 'code') =>
    fetch('/api/setup/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method }),
    }).then(json<{ ok: true; method: 'qr' | 'code' }>),
};
