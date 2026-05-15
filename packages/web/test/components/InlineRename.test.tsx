import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineRename } from '../../src/components/primitives/InlineRename.js';

describe('InlineRename', () => {
  it('renders with initial value', () => {
    render(<InlineRename initialValue="Alice" onCommit={vi.fn()} />);
    const input = screen.getByRole('textbox');
    expect((input as HTMLInputElement).value).toBe('Alice');
  });

  it('calls onCommit with trimmed value on blur', async () => {
    const onCommit = vi.fn();
    render(<InlineRename initialValue="Alice" onCommit={onCommit} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '  Bob  ');
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('Bob');
  });

  it('calls onCommit on Enter key', async () => {
    const onCommit = vi.fn();
    render(<InlineRename initialValue="Alice" onCommit={onCommit} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Charlie{Enter}');
    expect(onCommit).toHaveBeenCalledWith('Charlie');
  });

  it('reverts to initialValue on Escape', async () => {
    const onCommit = vi.fn();
    render(<InlineRename initialValue="Alice" onCommit={onCommit} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Partial');
    await userEvent.keyboard('{Escape}');
    expect((input as HTMLInputElement).value).toBe('Alice');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not call onCommit when submitting empty string', async () => {
    const onCommit = vi.fn();
    render(<InlineRename initialValue="Alice" onCommit={onCommit} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    // Input reverts to initialValue
    expect((input as HTMLInputElement).value).toBe('Alice');
  });

  it('respects maxLength prop', () => {
    render(<InlineRename initialValue="Alice" onCommit={vi.fn()} maxLength={10} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('maxLength', '10');
  });
});
