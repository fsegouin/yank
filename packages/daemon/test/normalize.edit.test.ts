import { describe, it, expect } from 'vitest';
import { proto } from '@whiskeysockets/baileys';
import { normalizeBaileysEdit } from '../src/normalize.js';

// Build a minimal Baileys proto message that looks like an inbound EDIT protocolMessage.
function makeEditProto(opts: {
  remoteJid: string;
  targetWaMessageId: string;
  newText: string;
  ts?: number;
}): proto.IWebMessageInfo {
  return {
    key: { remoteJid: opts.remoteJid, id: 'PROTOCOL-MSG-ID', fromMe: false },
    messageTimestamp: opts.ts ?? Math.floor(Date.now() / 1000),
    message: {
      protocolMessage: {
        type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
        key: { remoteJid: opts.remoteJid, id: opts.targetWaMessageId, fromMe: true },
        editedMessage: {
          conversation: opts.newText,
        },
      },
    },
  };
}

describe('normalizeBaileysEdit', () => {
  it('returns InboundEdit for MESSAGE_EDIT protocolMessage', () => {
    const m = makeEditProto({
      remoteJid: '447700000004@s.whatsapp.net',
      targetWaMessageId: 'WA-TARGET-1',
      newText: 'edited content',
    });
    const result = normalizeBaileysEdit(m);
    expect(result).not.toBeNull();
    expect(result?.targetWaMessageId).toBe('WA-TARGET-1');
    expect(result?.text).toBe('edited content');
    expect(result?.chatJid).toBe('447700000004@s.whatsapp.net');
  });

  it('returns null for REVOKE protocolMessage', () => {
    const m: proto.IWebMessageInfo = {
      key: { remoteJid: '447@s.whatsapp.net', id: 'some-id' },
      message: {
        protocolMessage: {
          type: proto.Message.ProtocolMessage.Type.REVOKE,
          key: { id: 'target' },
        },
      },
    };
    expect(normalizeBaileysEdit(m)).toBeNull();
  });

  it('returns null for a regular text message', () => {
    const m: proto.IWebMessageInfo = {
      key: { remoteJid: '447@s.whatsapp.net', id: 'some-id' },
      message: { conversation: 'hello' },
    };
    expect(normalizeBaileysEdit(m)).toBeNull();
  });

  it('handles extendedTextMessage inside editedMessage', () => {
    const m: proto.IWebMessageInfo = {
      key: { remoteJid: '447@s.whatsapp.net', id: 'PROTO-ID' },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: {
        protocolMessage: {
          type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
          key: { remoteJid: '447@s.whatsapp.net', id: 'WA-TARGET-2', fromMe: true },
          editedMessage: {
            extendedTextMessage: { text: 'extended edit' },
          },
        },
      },
    };
    const result = normalizeBaileysEdit(m);
    expect(result?.text).toBe('extended edit');
  });
});
