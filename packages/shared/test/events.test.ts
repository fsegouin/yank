import { describe, it, expect } from 'vitest';
import { DaemonEventSchema, ApiCommandSchema } from '../src/events.js';

describe('DaemonEventSchema', () => {
  it('parses a connected event', () => {
    const e = DaemonEventSchema.parse({
      type: 'connected',
      userId: '0193fe00-0000-7000-8000-000000000001',
      jid: '15555550100@s.whatsapp.net',
      phone: '+15555550100',
    });
    expect(e.type).toBe('connected');
  });

  it('parses a qr event', () => {
    const e = DaemonEventSchema.parse({
      type: 'qr',
      userId: '0193fe00-0000-7000-8000-000000000001',
      data: '2@abc123…',
    });
    expect(e.type).toBe('qr');
  });

  it('parses a message event', () => {
    const e = DaemonEventSchema.parse({
      type: 'message',
      userId: '0193fe00-0000-7000-8000-000000000001',
      chatId: '0193fe00-0000-7000-8000-000000000002',
      messageId: '0193fe00-0000-7000-8000-000000000003',
    });
    expect(e.type).toBe('message');
  });

  it('rejects unknown event types', () => {
    expect(() =>
      DaemonEventSchema.parse({ type: 'bogus', userId: 'x' }),
    ).toThrow();
  });
});

describe('ApiCommandSchema', () => {
  it('parses a pair command', () => {
    const c = ApiCommandSchema.parse({
      type: 'pair',
      userId: '0193fe00-0000-7000-8000-000000000001',
      method: 'qr',
    });
    expect(c.type).toBe('pair');
  });

  it('parses a send command', () => {
    const c = ApiCommandSchema.parse({
      type: 'send',
      userId: '0193fe00-0000-7000-8000-000000000001',
      localId: '0193fe00-0000-7000-8000-000000000099',
      chatJid: '15555550100@s.whatsapp.net',
      text: 'hello world',
    });
    expect(c.type).toBe('send');
  });
});
