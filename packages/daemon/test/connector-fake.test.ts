import { describe, it, expect, vi } from 'vitest';
import { FakeConnector } from '../src/connector-fake.js';

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
