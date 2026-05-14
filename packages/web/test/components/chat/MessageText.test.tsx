import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageText } from '../../../src/components/chat/MessageText.js';

describe('MessageText', () => {
  it('renders @mentions inside a .mention span', () => {
    render(<MessageText text="hi @ash" />);
    const mention = screen.getByText('@ash');
    expect(mention.tagName).toBe('SPAN');
    expect(mention.className).toContain('mention');
  });

  it('renders **bold** inside <strong>', () => {
    render(<MessageText text="**foo**" />);
    expect(screen.getByText('foo').tagName).toBe('STRONG');
  });

  it('renders `code` inside <code>', () => {
    render(<MessageText text="`x`" />);
    expect(screen.getByText('x').tagName).toBe('CODE');
  });

  it('renders URLs as anchor with href', () => {
    render(<MessageText text="see https://x.io now" />);
    const anchor = screen.getByText('https://x.io');
    expect(anchor.tagName).toBe('A');
    expect(anchor).toHaveAttribute('href', 'https://x.io');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    expect(anchor).toHaveAttribute('target', '_blank');
  });

  it('returns null for empty text', () => {
    const { container } = render(<MessageText text={null} />);
    expect(container.firstChild).toBeNull();
  });
});
