import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TriageProgressBar } from '../../../src/components/triage/TriageProgressBar.js';

describe('TriageProgressBar', () => {
  it('renders assigned and total counts', () => {
    render(<TriageProgressBar assigned={3} total={10} />);
    expect(screen.getByText(/3\/10/)).toBeInTheDocument();
  });

  it('renders percentage text', () => {
    render(<TriageProgressBar assigned={5} total={10} />);
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it('renders the fill bar with correct width style', () => {
    const { container } = render(<TriageProgressBar assigned={2} total={4} />);
    const fill = container.querySelector('[data-fill]') as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill?.style.width).toBe('50%');
  });

  it('renders keyboard hint text', () => {
    render(<TriageProgressBar assigned={0} total={5} />);
    expect(screen.getByText(/navigate/i)).toBeInTheDocument();
  });

  it('clamps fill width to 100% when all assigned', () => {
    const { container } = render(<TriageProgressBar assigned={5} total={5} />);
    const fill = container.querySelector('[data-fill]') as HTMLElement | null;
    expect(fill?.style.width).toBe('100%');
  });
});
