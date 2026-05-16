import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMentionAutocomplete } from '../../src/hooks/useMentionAutocomplete.js';
import type { ChatMember } from '@yank/shared';

const members: ChatMember[] = [
  { chatId: 'c1', jid: 'alice@s.whatsapp.net', displayName: 'Alice', role: 'member' },
  { chatId: 'c1', jid: 'bob@s.whatsapp.net', displayName: 'Bob', role: 'member' },
  { chatId: 'c1', jid: 'alicia@s.whatsapp.net', displayName: 'Alicia', role: 'admin' },
  {
    chatId: 'c1',
    jid: '99lid@lid.whatsapp.net',
    displayName: null,
    role: 'member',
  },
];

describe('useMentionAutocomplete', () => {
  it('query is null when no @ in text', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('hello world', 11);
    });
    expect(result.current.query).toBeNull();
  });

  it('sets query when @ is typed at end of text', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('hey @al', 7);
    });
    expect(result.current.query).toBe('al');
  });

  it('sets query to empty string immediately after @', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('@', 1);
    });
    expect(result.current.query).toBe('');
  });

  it('filters members by substring (case-insensitive)', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('@al', 3);
    });
    expect(result.current.filteredMembers.map((m) => m.displayName)).toContain('Alice');
    expect(result.current.filteredMembers.map((m) => m.displayName)).toContain('Alicia');
    expect(result.current.filteredMembers.map((m) => m.displayName)).not.toContain('Bob');
  });

  it('lid members appear with null displayName (rendered as @Unknown (lid) at display time)', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('@', 1);
    });
    const lidMember = result.current.filteredMembers.find((m) =>
      m.jid.includes('@lid.'),
    );
    expect(lidMember).toBeDefined();
    expect(lidMember!.displayName).toBeNull();
  });

  it('caps filteredMembers at 8', () => {
    const bigList: ChatMember[] = Array.from({ length: 12 }, (_, i) => ({
      chatId: 'c1',
      jid: `u${i}@s.whatsapp.net`,
      displayName: `User${i}`,
      role: 'member' as const,
    }));
    const { result } = renderHook(() => useMentionAutocomplete(bigList));
    act(() => {
      result.current.onTextChange('@', 1);
    });
    expect(result.current.filteredMembers.length).toBeLessThanOrEqual(8);
  });

  it('commit replaces @<query> with @<displayName> and trailing space at end', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('hey @al', 7);
    });
    let commitResult: { text: string; caret: number } | undefined;
    act(() => {
      commitResult = result.current.commit(members[0]!); // Alice
    });
    expect(commitResult!.text).toBe('hey @Alice ');
    expect(commitResult!.caret).toBe('hey @Alice '.length);
    expect(result.current.query).toBeNull();
  });

  it('commit inserts @<displayName> in the middle of text', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    // "@al world" with caret at position 3 (after "@al")
    act(() => {
      result.current.onTextChange('@al world', 3);
    });
    let commitResult: { text: string; caret: number } | undefined;
    act(() => {
      commitResult = result.current.commit(members[0]!); // Alice
    });
    expect(commitResult!.text).toBe('@Alice  world');
    // caret placed after '@Alice '
    expect(commitResult!.caret).toBe('@Alice '.length);
  });

  it('commit records the mention in accumulated mentions', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('hey @al', 7);
    });
    act(() => {
      result.current.commit(members[0]!);
    });
    expect(result.current.mentions).toHaveLength(1);
    expect(result.current.mentions[0]!.jid).toBe('alice@s.whatsapp.net');
  });

  it('ambiguity tie-break: first match wins', () => {
    const dupeMembers: ChatMember[] = [
      { chatId: 'c1', jid: 'alice1@s.whatsapp.net', displayName: 'Alice', role: 'member' },
      { chatId: 'c1', jid: 'alice2@s.whatsapp.net', displayName: 'Alice', role: 'member' },
    ];
    const { result } = renderHook(() => useMentionAutocomplete(dupeMembers));
    act(() => {
      result.current.onTextChange('@Alice', 6);
    });
    let commitResult: { text: string; caret: number } | undefined;
    act(() => {
      commitResult = result.current.commit(dupeMembers[0]!);
    });
    expect(result.current.mentions[0]!.jid).toBe('alice1@s.whatsapp.net');
    expect(commitResult!.text).toBe('@Alice ');
  });

  it('selectNext / selectPrev cycle through filteredMembers', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('@', 1);
    });
    expect(result.current.selectedIndex).toBe(0);
    act(() => {
      result.current.selectNext();
    });
    expect(result.current.selectedIndex).toBe(1);
    act(() => {
      result.current.selectPrev();
    });
    expect(result.current.selectedIndex).toBe(0);
    // does not underflow
    act(() => {
      result.current.selectPrev();
    });
    expect(result.current.selectedIndex).toBe(0);
  });

  it('dismiss sets query to null', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('@al', 3);
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.query).toBeNull();
  });

  it('reset clears mentions and query', () => {
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('hey @al', 7);
    });
    act(() => {
      result.current.commit(members[0]!);
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.mentions).toHaveLength(0);
    expect(result.current.query).toBeNull();
  });

  it('does not open popover if @ is preceded by a non-space character', () => {
    // e.g. email-like "user@domain" should not trigger
    const { result } = renderHook(() => useMentionAutocomplete(members));
    act(() => {
      result.current.onTextChange('user@domain', 11);
    });
    expect(result.current.query).toBeNull();
  });
});
