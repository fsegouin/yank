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

const userId = '01938b3a-8b1b-7c00-a000-000000000001';
const chatId = '01938b3a-8b1b-7c00-a000-000000000002';
const messageId = '01938b3a-8b1b-7c00-a000-000000000003';
const contactId = '01938b3a-8b1b-7c00-a000-000000000004';

describe('M4 SSE events', () => {
  it('parses chat-assignment', () => {
    const evt = DaemonEventSchema.parse({
      userId, type: 'chat-assignment',
      chatId, workspace: 'personal',
      assignedAt: '2026-05-15T12:00:00.000Z',
    });
    expect(evt.type).toBe('chat-assignment');
  });

  it('parses contact-update', () => {
    const evt = DaemonEventSchema.parse({
      userId, type: 'contact-update',
      contactId, displayName: 'Alice',
      updatedAt: '2026-05-15T12:00:00.000Z',
    });
    expect(evt.type).toBe('contact-update');
  });

  it('parses message-edit', () => {
    const evt = DaemonEventSchema.parse({
      userId, type: 'message-edit',
      messageId, text: 'edited text',
      editedAt: '2026-05-15T12:00:00.000Z',
    });
    expect(evt.type).toBe('message-edit');
  });

  it('parses message-edit-failed', () => {
    const evt = DaemonEventSchema.parse({
      userId, type: 'message-edit-failed',
      messageId, reason: 'too-old',
    });
    expect(evt.type).toBe('message-edit-failed');
  });

  it('parses media-breaker-state open with retryAt', () => {
    const evt = DaemonEventSchema.parse({
      userId, type: 'media-breaker-state',
      state: 'open', retryAt: '2026-05-15T12:05:00.000Z',
    });
    expect(evt.type).toBe('media-breaker-state');
  });

  it('parses media-breaker-state closed without retryAt', () => {
    const evt = DaemonEventSchema.parse({
      userId, type: 'media-breaker-state',
      state: 'closed',
    });
    expect(evt.type).toBe('media-breaker-state');
  });
});

describe('M4 commands', () => {
  it('parses edit-message command', () => {
    const cmd = ApiCommandSchema.parse({
      userId: '01938b3a-8b1b-7c00-a000-000000000001',
      type: 'edit-message',
      messageId: '01938b3a-8b1b-7c00-a000-000000000003',
      waMessageId: '3EB0ABCDEF',
      chatJid: '11111@s.whatsapp.net',
      text: 'updated',
    });
    expect(cmd.type).toBe('edit-message');
  });

  it('rejects edit-message with empty text', () => {
    expect(() =>
      ApiCommandSchema.parse({
        userId: '01938b3a-8b1b-7c00-a000-000000000001',
        type: 'edit-message',
        messageId: '01938b3a-8b1b-7c00-a000-000000000003',
        waMessageId: '3EB0ABCDEF',
        chatJid: '11111@s.whatsapp.net',
        text: '',
      }),
    ).toThrow();
  });
});
