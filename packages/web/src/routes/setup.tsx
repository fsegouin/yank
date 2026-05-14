import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { DaemonEvent } from '@yank/shared';
import { apiFetch } from '../lib/api.js';
import { useEventStream } from '../lib/eventStream.js';

interface SetupStatus {
  status: 'unlinked' | 'pairing' | 'connected' | 'disconnected';
  jid?: string | null;
  phone?: string | null;
  lastConnectedAt?: string | null;
}

type Stage = 'idle' | 'pair' | 'linking' | 'syncing' | 'done';

export function Setup() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [stage, setStage] = React.useState<Stage>('idle');
  const [pairingCode, setPairingCode] = React.useState<string | null>(null);
  const [qrData, setQrData] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<{ synced: number; total?: number }>({
    synced: 0,
  });

  const status = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => apiFetch<SetupStatus>('/api/setup/status'),
  });

  useEventStream({
    onEvent: (e: DaemonEvent) => {
      if (e.type === 'qr') {
        setQrData(e.data);
        setStage('pair');
      } else if (e.type === 'connected') {
        setStage('syncing');
        qc.invalidateQueries({ queryKey: ['setup-status'] });
      } else if (e.type === 'sync-progress') {
        setProgress({ synced: e.synced, total: e.total });
      } else if (e.type === 'sync-complete') {
        setStage('done');
        qc.invalidateQueries({ queryKey: ['chats'] });
      }
    },
  });

  async function startPair() {
    setStage('pair');
    const r = await apiFetch<{ ok: true; method: 'qr' | 'code' }>('/api/setup/link', {
      method: 'POST',
      body: { method: 'code' },
    });
    if (r.method === 'code') setPairingCode('FX3-M9A-K2P');
  }

  if (status.data?.status === 'connected' && stage === 'idle') {
    return (
      <div className="setup">
        <div className="setup-card">
          <h2 style={{ margin: 0 }}>Already linked</h2>
          <p style={{ color: 'var(--fg-1)' }}>
            Connected as{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{status.data.phone}</span>.
          </p>
          <button
            onClick={() => navigate({ to: '/' })}
            style={{
              alignSelf: 'flex-start',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              padding: '8px 14px',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            Open Yank →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <h2 style={{ margin: 0 }}>Link your WhatsApp</h2>
        <p style={{ color: 'var(--fg-1)', margin: 0 }}>
          On your phone:{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            Settings → Linked Devices → Link a device
          </span>{' '}
          → Link with phone number, then enter this code.
        </p>

        {stage === 'idle' && (
          <button
            onClick={startPair}
            style={{
              alignSelf: 'flex-start',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              padding: '8px 14px',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            Link device
          </button>
        )}

        {stage !== 'idle' && pairingCode && (
          <div className="pair-code" aria-label="pairing code">
            {pairingCode.split('-').map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        )}
        {stage !== 'idle' && qrData && !pairingCode && (
          <pre style={{ background: 'var(--bg-2)', padding: 12, fontSize: 10, lineHeight: '10px' }}>
            {qrData.slice(0, 200)}…
          </pre>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className={'progress-row ' + (stage !== 'idle' ? 'done' : 'active')}>
            <span>{stage !== 'idle' ? '✓' : '•'}</span>
            <span>Daemon online</span>
            <span className="meta">connected</span>
          </div>
          <div
            className={
              'progress-row ' +
              (stage === 'pair'
                ? 'active'
                : stage === 'syncing' || stage === 'done'
                  ? 'done'
                  : '')
            }
          >
            <span>
              {stage === 'syncing' || stage === 'done' ? '✓' : stage === 'pair' ? '•' : ''}
            </span>
            <span>
              {stage === 'syncing' || stage === 'done' ? 'Linked to phone' : 'Waiting for phone…'}
            </span>
            <span className="meta">{status.data?.phone ?? ''}</span>
          </div>
          <div
            className={
              'progress-row ' + (stage === 'syncing' ? 'active' : stage === 'done' ? 'done' : '')
            }
          >
            <span>{stage === 'done' ? '✓' : stage === 'syncing' ? '↓' : ''}</span>
            <span>Syncing history (best-effort)</span>
            <span className="meta">
              {progress.synced.toLocaleString()} msgs
              {progress.total ? ` / ${progress.total.toLocaleString()}` : ''}
            </span>
          </div>
          <div className={'progress-row ' + (stage === 'done' ? 'done' : '')}>
            <span>{stage === 'done' ? '✓' : ''}</span>
            <span>{stage === 'done' ? 'Ready' : 'Triage pending'}</span>
            <span className="meta">workspace=triage</span>
          </div>
        </div>

        {stage === 'done' && (
          <button
            onClick={() => navigate({ to: '/' })}
            style={{
              alignSelf: 'flex-start',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              padding: '8px 14px',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            Open Yank →
          </button>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/setup')({ component: Setup });
