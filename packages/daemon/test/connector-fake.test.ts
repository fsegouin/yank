import { describe, it, expect, vi } from 'vitest';
import { FakeConnector } from '../src/connector-fake.js';

describe('FakeConnector.editMessage', () => {
  it('records the call in editCalls', async () => {
    const fc = new FakeConnector();
    await fc.editMessage('447@s.whatsapp.net', 'WA-123', 'new text');
    expect(fc.editCalls).toHaveLength(1);
    expect(fc.editCalls[0]).toEqual({ jid: '447@s.whatsapp.net', waMessageId: 'WA-123', text: 'new text' });
  });

  it('throws when editError is set', async () => {
    const fc = new FakeConnector();
    fc.editError = new Error('too old');
    await expect(fc.editMessage('447@s.whatsapp.net', 'WA-123', 'text')).rejects.toThrow('too old');
  });

  it('records multiple calls independently', async () => {
    const fc = new FakeConnector();
    await fc.editMessage('j1', 'id1', 't1');
    await fc.editMessage('j2', 'id2', 't2');
    expect(fc.editCalls).toHaveLength(2);
    expect(fc.editCalls[1]).toMatchObject({ jid: 'j2', waMessageId: 'id2', text: 't2' });
  });
});

describe('FakeConnector', () => {
  it('emits qr → open on requestPair', async () => {
    const c = new FakeConnector();
    const onQr = vi.fn();
    const onOpen = vi.fn();
    c.on('qr', onQr);
    c.on('open', onOpen);

    await c.start();
    await c.requestPair('qr');
    c.simulatePair({ jid: '4400000000000@s.whatsapp.net', phone: '+440000000000' });

    expect(onQr).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith({
      jid: '4400000000000@s.whatsapp.net',
      phone: '+440000000000',
    });
  });

  it('records sent text and resolves with a synthesised waMessageId', async () => {
    const c = new FakeConnector();
    await c.start();
    const r = await c.sendText({ chatJid: '4477@s.whatsapp.net', text: 'hi' });
    expect(r.waMessageId).toMatch(/^fake-/);
    expect(r.ts).toBeInstanceOf(Date);
    expect(c.sent).toEqual([{ chatJid: '4477@s.whatsapp.net', text: 'hi' }]);
  });

  it('replays inbound messages pushed by tests', () => {
    const c = new FakeConnector();
    const onMessage = vi.fn();
    c.on('message', onMessage);
    c.pushMessage(
      {
        waMessageId: 'WA-1',
        chatJid: '4477@s.whatsapp.net',
        senderJid: '4477@s.whatsapp.net',
        fromMe: false,
        ts: new Date(0),
        kind: 'text',
        text: 'yo',
      },
      { jid: '4477@s.whatsapp.net', type: 'dm' },
      { jid: '4477@s.whatsapp.net', pushName: 'Yo' },
    );
    expect(onMessage).toHaveBeenCalledOnce();
  });
});
