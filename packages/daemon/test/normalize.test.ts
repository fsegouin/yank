import { describe, it, expect } from 'vitest';
import { normalizeBaileysMessage } from '../src/normalize.js';

const baseMsg = {
  key: { remoteJid: '4477@s.whatsapp.net', id: 'WA-A', fromMe: false, participant: undefined },
  messageTimestamp: 1715680800,
  pushName: 'Friend',
  message: { conversation: 'hello world' },
};

describe('normalizeBaileysMessage', () => {
  it('extracts text from conversation', () => {
    const r = normalizeBaileysMessage(baseMsg as any);
    expect(r?.msg.text).toBe('hello world');
    expect(r?.msg.waMessageId).toBe('WA-A');
    expect(r?.chat.type).toBe('dm');
    expect(r?.contact.pushName).toBe('Friend');
  });

  it('extracts text from extendedTextMessage', () => {
    const r = normalizeBaileysMessage({
      ...baseMsg,
      message: { extendedTextMessage: { text: 'replying' } },
    } as any);
    expect(r?.msg.text).toBe('replying');
  });

  it('returns null for unsupported kinds (image, sticker, etc.)', () => {
    const r = normalizeBaileysMessage({
      ...baseMsg,
      message: { imageMessage: { caption: 'pic' } },
    } as any);
    expect(r).toBeNull();
  });

  it('detects groups via @g.us remoteJid and uses participant as senderJid', () => {
    const r = normalizeBaileysMessage({
      ...baseMsg,
      key: {
        remoteJid: '120363@g.us',
        id: 'WA-B',
        fromMe: false,
        participant: '4477@s.whatsapp.net',
      },
    } as any);
    expect(r?.chat.type).toBe('group');
    expect(r?.msg.senderJid).toBe('4477@s.whatsapp.net');
  });

  it('extracts quotedWaId from contextInfo', () => {
    const r = normalizeBaileysMessage({
      ...baseMsg,
      message: {
        extendedTextMessage: {
          text: 'yes',
          contextInfo: { stanzaId: 'WA-PARENT' },
        },
      },
    } as any);
    expect(r?.msg.quotedWaId).toBe('WA-PARENT');
  });
});
