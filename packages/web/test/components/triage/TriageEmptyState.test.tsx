import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TriageEmptyState } from '../../../src/components/triage/TriageEmptyState.js';

describe('TriageEmptyState', () => {
  it('renders the "Triage clear" heading', () => {
    render(<TriageEmptyState />);
    expect(screen.getByText('Triage clear')).toBeInTheDocument();
  });

  it('renders the descriptive subtext', () => {
    render(<TriageEmptyState />);
    expect(screen.getByText(/All new chats have a home/i)).toBeInTheDocument();
  });

  it('renders a checkmark glyph', () => {
    const { container } = render(<TriageEmptyState />);
    expect(container.querySelector('[data-glyph="check"]')).toBeInTheDocument();
  });
});
