import { useMemo } from 'react';
import type { Message } from '@yank/shared';

export interface ChatFilterResult {
  hits: Message[];
  currentHit: Message | undefined;
}

export function useChatFilter(
  query: string,
  messages: Message[],
  hitIndex: number,
): ChatFilterResult {
  const hits = useMemo<Message[]>(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return messages.filter((m) => m.text?.toLowerCase().includes(lower) ?? false);
  }, [query, messages]);

  const safeIndex = hits.length > 0 ? hitIndex % hits.length : 0;
  const currentHit = hits[safeIndex];

  return { hits, currentHit };
}
