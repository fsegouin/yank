import { describe, it, expect } from 'vitest';
import {
  normalizeBaileysDeletion,
  normalizeBaileysMessage,
  normalizeBaileysReaction,
} from '../src/normalize.js';

const baseMsg = {
  key: { remoteJid: '4477@s.whatsapp.net', id: 'WA-A', fromMe: false, participant: undefined },
  messageTimestamp: 1715680800,
  pushName: 'Friend',
  message: { conversation: 'hello world' },
};

describe('normalizeBaileysMessage', () => {
  it('extracts text from conversation', () => {
    const r = normalizeBaileysMessage(
      baseMsg as unknown as Parameters<typeof normalizeBaileysMessage>[0],
    );
    expect(r?.msg.text).toBe('hello world');
    expect(r?.msg.waMessageId).toBe('WA-A');
    expect(r?.chat.type).toBe('dm');
    expect(r?.contact.pushName).toBe('Friend');
  });

  it('extracts text from extendedTextMessage', () => {
    const r = normalizeBaileysMessage({
      ...baseMsg,
      message: { extendedTextMessage: { text: 'replying' } },
    } as unknown as Parameters<typeof normalizeBaileysMessage>[0]);
    expect(r?.msg.text).toBe('replying');
  });

  it('normalizes imageMessage to kind=image with caption', () => {
    const r = normalizeBaileysMessage({
      ...baseMsg,
      message: { imageMessage: { caption: 'pic', mimetype: 'image/jpeg', fileLength: 42 } },
    } as unknown as Parameters<typeof normalizeBaileysMessage>[0]);
    expect(r?.msg.kind).toBe('image');
    expect(r?.msg.text).toBe('pic');
    expect(r?.msg.media?.mime).toBe('image/jpeg');
    expect(r?.msg.media?.sizeBytes).toBe(42);
  });

  it('normalizes audioMessage with durationMs from seconds*1000', () => {
    const r = normalizeBaileysMessage({
      ...baseMsg,
      message: { audioMessage: { seconds: 7, mimetype: 'audio/ogg' } },
    } as unknown as Parameters<typeof normalizeBaileysMessage>[0]);
    expect(r?.msg.kind).toBe('audio');
    expect(r?.msg.text).toBeNull();
    expect(r?.msg.media?.durationMs).toBe(7000);
  });

  it('normalizes documentMessage with text=fileName', () => {
    const r = normalizeBaileysMessage({
      ...baseMsg,
      message: { documentMessage: { fileName: 'spec.pdf', mimetype: 'application/pdf' } },
    } as unknown as Parameters<typeof normalizeBaileysMessage>[0]);
    expect(r?.msg.kind).toBe('document');
    expect(r?.msg.text).toBe('spec.pdf');
    expect(r?.msg.media?.fileName).toBe('spec.pdf');
  });

  it('returns null for ephemeral protocolMessage', () => {
    const r = normalizeBaileysMessage({
      ...baseMsg,
      message: { protocolMessage: { type: 3 } }, // EPHEMERAL_SETTING
    } as unknown as Parameters<typeof normalizeBaileysMessage>[0]);
    expect(r).toBeNull();
  });

  it('returns null for protocolMessage REVOKE (route via normalizeBaileysDeletion)', () => {
    const r = normalizeBaileysMessage({
      ...baseMsg,
      message: { protocolMessage: { type: 0, key: { id: 'WA-TARGET' } } }, // REVOKE
    } as unknown as Parameters<typeof normalizeBaileysMessage>[0]);
    expect(r).toBeNull();
  });

  it('returns null for reactionMessage payloads (route via normalizeBaileysReaction)', () => {
    const r = normalizeBaileysMessage({
      ...baseMsg,
      message: { reactionMessage: { key: { id: 'WA-PARENT' }, text: 'love' } },
    } as unknown as Parameters<typeof normalizeBaileysMessage>[0]);
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
    } as unknown as Parameters<typeof normalizeBaileysMessage>[0]);
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
    } as unknown as Parameters<typeof normalizeBaileysMessage>[0]);
    expect(r?.msg.quotedWaId).toBe('WA-PARENT');
  });
});

describe('normalizeBaileysDeletion', () => {
  it('extracts target waMessageId + chatJid from REVOKE protocolMessage', () => {
    const d = normalizeBaileysDeletion({
      key: { remoteJid: '4477@s.whatsapp.net', id: 'WA-OUTER', fromMe: false },
      messageTimestamp: 1715680800,
      message: { protocolMessage: { type: 0, key: { id: 'WA-TARGET' } } }, // REVOKE
    } as unknown as Parameters<typeof normalizeBaileysDeletion>[0]);
    expect(d?.targetWaMessageId).toBe('WA-TARGET');
    expect(d?.chatJid).toBe('4477@s.whatsapp.net');
    expect(d?.ts).toBeInstanceOf(Date);
  });

  it('returns null for non-REVOKE protocol messages', () => {
    const d = normalizeBaileysDeletion({
      key: { remoteJid: '4477@s.whatsapp.net', id: 'WA-OUTER', fromMe: false },
      messageTimestamp: 1715680800,
      message: { protocolMessage: { type: 3, key: { id: 'WA-TARGET' } } }, // EPHEMERAL_SETTING
    } as unknown as Parameters<typeof normalizeBaileysDeletion>[0]);
    expect(d).toBeNull();
  });

  it('returns null when there is no protocolMessage', () => {
    const d = normalizeBaileysDeletion({
      key: { remoteJid: '4477@s.whatsapp.net', id: 'WA-OUTER', fromMe: false },
      messageTimestamp: 1715680800,
      message: { conversation: 'hi' },
    } as unknown as Parameters<typeof normalizeBaileysDeletion>[0]);
    expect(d).toBeNull();
  });
});

describe('normalizeBaileysReaction', () => {
  it('extracts emoji + targetWaMessageId in DM', () => {
    const r = normalizeBaileysReaction({
      key: { remoteJid: '4477@s.whatsapp.net', id: 'WA-R', fromMe: false },
      messageTimestamp: 1715680800,
      message: {
        reactionMessage: { key: { id: 'WA-PARENT' }, text: '🔥' },
      },
    } as unknown as Parameters<typeof normalizeBaileysReaction>[0]);
    expect(r?.targetWaMessageId).toBe('WA-PARENT');
    expect(r?.emoji).toBe('🔥');
    expect(r?.reactorJid).toBe('4477@s.whatsapp.net');
  });

  it('uses "me" for self-reactions in DMs and empty string for removed', () => {
    const r = normalizeBaileysReaction({
      key: { remoteJid: '4477@s.whatsapp.net', id: 'WA-R2', fromMe: true },
      messageTimestamp: 1715680800,
      message: { reactionMessage: { key: { id: 'WA-P2' }, text: '' } },
    } as unknown as Parameters<typeof normalizeBaileysReaction>[0]);
    expect(r?.reactorJid).toBe('me');
    expect(r?.emoji).toBe('');
  });

  it('uses participant as reactorJid for group reactions', () => {
    const r = normalizeBaileysReaction({
      key: {
        remoteJid: '120363@g.us',
        id: 'WA-R3',
        fromMe: false,
        participant: '4477@s.whatsapp.net',
      },
      messageTimestamp: 1715680800,
      message: { reactionMessage: { key: { id: 'WA-P3' }, text: '👍' } },
    } as unknown as Parameters<typeof normalizeBaileysReaction>[0]);
    expect(r?.reactorJid).toBe('4477@s.whatsapp.net');
  });
});
