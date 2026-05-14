import { Link, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export function Shell({
  children,
  activeChatId: _activeChatId,
}: {
  children: ReactNode;
  activeChatId: string | null;
}) {
  const nav = useNavigate();
  return (
    <div className="shell">
      <aside className="rail">
        <Link
          to="/"
          title="Home"
          style={{
            color: 'var(--fg-0)',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
          }}
        >
          yk
        </Link>
        <button
          onClick={() => nav({ to: '/setup' })}
          title="Setup"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--fg-1)',
            cursor: 'pointer',
          }}
        >
          ⚙
        </button>
      </aside>
      {children}
    </div>
  );
}
