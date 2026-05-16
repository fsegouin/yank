import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SetNicknameAffordance } from '../../src/components/chat/SetNicknameAffordance.js';

vi.mock('../../src/lib/mutations.js', () => ({
  useUpdateContactName: vi.fn(() => ({ mutate: vi.fn() })),
}));

const JID = '50264102985962@lid';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('SetNicknameAffordance', () => {
  it('renders a "Set nickname" button by default', () => {
    render(<SetNicknameAffordance senderJid={JID} />, { wrapper });
    expect(screen.getByRole('button', { name: /set nickname/i })).toBeInTheDocument();
  });

  it('clicking the button reveals an input', async () => {
    render(<SetNicknameAffordance senderJid={JID} />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /set nickname/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('committing the input calls useUpdateContactName.mutate with the senderJid', async () => {
    const { useUpdateContactName } = await import('../../src/lib/mutations.js');
    const mockMutate = vi.fn();
    vi.mocked(useUpdateContactName).mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof useUpdateContactName>);

    render(<SetNicknameAffordance senderJid={JID} />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /set nickname/i }));
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Bob');
    fireEvent.blur(input);

    expect(vi.mocked(useUpdateContactName)).toHaveBeenCalledWith(JID);
    expect(mockMutate).toHaveBeenCalledWith({ displayName: 'Bob' });
  });

  it('Escape closes the input without committing', async () => {
    const { useUpdateContactName } = await import('../../src/lib/mutations.js');
    const mockMutate = vi.fn();
    vi.mocked(useUpdateContactName).mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof useUpdateContactName>);

    render(<SetNicknameAffordance senderJid={JID} />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /set nickname/i }));
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Bob');
    await userEvent.keyboard('{Escape}');

    expect(mockMutate).not.toHaveBeenCalled();
    // Back to the button state
    expect(screen.getByRole('button', { name: /set nickname/i })).toBeInTheDocument();
  });
});
