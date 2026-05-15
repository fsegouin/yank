import { describe, expect, it } from 'vitest';
import {
  ChatSchema,
  MessageSchema,
  MessagesPageSchema,
  ChatMemberSchema,
  AssignmentBodySchema,
  ContactRenameBodySchema,
  EditMessageBodySchema,
} from '../src/dto.js';

describe('DTO schemas', () => {
  it('parses a valid Chat', () => {
    const parsed = ChatSchema.parse({
      id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
      userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
      jid: '4477@s.whatsapp.net',
      type: 'group',
      subject: 'Q3 Brief',
      lastMessageAt: '2026-05-14T13:02:00.000Z',
      lastMessagePreview: 'Pushed v3',
      archived: false,
      mutedUntil: null,
      pinned: true,
      workspace: 'work',
      memberCount: 7,
      unreadCount: 4,
      lastReadMessageId: null,
      lastReadTs: null,
    });
    expect(parsed.type).toBe('group');
  });

  it('rejects an invalid workspace', () => {
    expect(() =>
      ChatSchema.parse({
        id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
        userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
        jid: 'x',
        type: 'dm',
        subject: null,
        lastMessageAt: null,
        lastMessagePreview: null,
        archived: false,
        mutedUntil: null,
        pinned: false,
        workspace: 'nope',
        memberCount: 0,
        unreadCount: 0,
        lastReadMessageId: null,
        lastReadTs: null,
      }),
    ).toThrow();
  });

  it('parses a MessagesPage with nullable cursor', () => {
    const parsed = MessagesPageSchema.parse({ messages: [], nextCursor: null });
    expect(parsed.nextCursor).toBeNull();
  });

  it('parses a ChatMember', () => {
    const m = ChatMemberSchema.parse({
      chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
      jid: '4477@s.whatsapp.net',
      displayName: 'Ash R.',
      role: 'member',
    });
    expect(m.role).toBe('member');
  });

  it('parses a Message with a quoted reply', () => {
    MessageSchema.parse({
      id: 'b1ee0d52-2c8e-7e7a-a4cf-000000000050',
      userId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000099',
      chatId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000001',
      waMessageId: 'ABCxyz',
      senderJid: '4477@s.whatsapp.net',
      ts: '2026-05-14T13:31:00.000Z',
      kind: 'text',
      text: 'Looks good',
      replyToId: 'b1ee0d52-2c8e-7e7a-a4cf-000000000049',
      editedAt: null,
      deletedAt: null,
      status: 'sent',
      reactions: [{ emoji: '👀', count: 2, mine: false }],
    });
  });
});

describe('M4 DTO schemas', () => {
  it('AssignmentBodySchema accepts valid workspace', () => {
    expect(AssignmentBodySchema.parse({ workspace: 'work' }).workspace).toBe('work');
    expect(AssignmentBodySchema.parse({ workspace: 'triage' }).workspace).toBe('triage');
  });

  it('AssignmentBodySchema rejects unknown workspace', () => {
    expect(() => AssignmentBodySchema.parse({ workspace: 'archive' })).toThrow();
  });

  it('ContactRenameBodySchema enforces non-empty trimmed name within 80 chars', () => {
    expect(ContactRenameBodySchema.parse({ displayName: 'Alice' }).displayName).toBe('Alice');
    expect(() => ContactRenameBodySchema.parse({ displayName: '' })).toThrow();
    expect(() => ContactRenameBodySchema.parse({ displayName: 'a'.repeat(81) })).toThrow();
  });

  it('EditMessageBodySchema enforces non-empty text', () => {
    expect(EditMessageBodySchema.parse({ text: 'hi' }).text).toBe('hi');
    expect(() => EditMessageBodySchema.parse({ text: '' })).toThrow();
  });
});
