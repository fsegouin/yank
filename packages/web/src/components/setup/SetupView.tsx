import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useEventStream } from '../../lib/eventStream.js';
import { apiFetch } from '../../lib/api.js';
import { CheckIcon } from '../icons/index.js';
import styles from './SetupView.module.css';

type Stage = 'qr' | 'connected' | 'syncing' | 'done';

interface Progress {
  synced: number;
  total?: number;
}

interface SetupStatus {
  status: 'unlinked' | 'pairing' | 'connected' | 'disconnected';
  jid?: string | null;
  phone?: string | null;
  lastConnectedAt?: string | null;
}

export function SetupView() {
  const [stage, setStage] = useState<Stage>('qr');
  const [qr, setQr] = useState<string>('');
  const [progress, setProgress] = useState<Progress>({ synced: 0 });
  const [hasKickedOff, setHasKickedOff] = useState(false);
  const navigate = useNavigate();

  const statusQuery = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => apiFetch<SetupStatus>('/api/setup/status'),
  });

  useEventStream({
    onEvent: (evt) => {
      if (evt.type === 'qr') setQr(evt.data);
      else if (evt.type === 'connected') setStage('connected');
      else if (evt.type === 'sync-progress') {
        setStage('syncing');
        setProgress({ synced: evt.synced, total: evt.total });
      } else if (evt.type === 'sync-complete') setStage('done');
    },
  });

  useEffect(() => {
    if (!statusQuery.data) return;
    if (statusQuery.data.status === 'connected' && stage === 'qr') {
      setStage('connected');
      return;
    }
    if (!hasKickedOff && statusQuery.data.status !== 'connected') {
      setHasKickedOff(true);
      void apiFetch<void>('/api/setup/link', { method: 'POST', body: { method: 'qr' } });
    }
  }, [statusQuery.data, stage, hasKickedOff]);

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.logo}>yk</div>
        <h1 className={styles.heading}>Link your WhatsApp</h1>
        <p className={styles.lede}>
          On your phone: WhatsApp →{' '}
          <span className="mono">Settings → Linked Devices → Link a device</span> → point your
          camera at this code.
        </p>

        <div className={styles.qrSlot} aria-live="polite">
          {statusQuery.isPending ? (
            <div className={styles.qrPlaceholder}>Checking session…</div>
          ) : statusQuery.data?.status === 'connected' ? (
            <div className={styles.qrPlaceholder}>
              Linked as{' '}
              <span className="mono">
                {statusQuery.data.phone ?? statusQuery.data.jid ?? 'unknown'}
              </span>
            </div>
          ) : qr ? (
            <QRCodeSVG
              value={qr}
              size={232}
              bgColor="#ffffff"
              fgColor="#000000"
              level="L"
              includeMargin={true}
            />
          ) : (
            <div className={styles.qrPlaceholder}>Waiting for daemon…</div>
          )}
        </div>

        <div className={styles.progress}>
          <Step label="Daemon online" done={true} />
          <Step
            label={stage === 'qr' ? 'Waiting for scan…' : 'Linked to phone'}
            done={stage !== 'qr'}
          />
          <Step
            label="Syncing history"
            done={stage === 'done'}
            active={stage === 'syncing'}
            meta={`${progress.synced.toLocaleString()} msgs${progress.total ? ` / ${progress.total.toLocaleString()}` : ''}`}
          />
          <Step label="Done" done={stage === 'done'} />
        </div>

        {stage !== 'qr' && (
          <button
            type="button"
            className={styles.cta}
            onClick={() => void navigate({ to: '/' })}
          >
            {stage === 'done' ? 'Open Yank →' : 'Continue to inbox →'}
          </button>
        )}
      </div>
    </div>
  );
}

function Step({
  label,
  done,
  active,
  meta,
}: {
  label: string;
  done: boolean;
  active?: boolean;
  meta?: string;
}) {
  return (
    <div
      className={
        styles.row + (done ? ' ' + styles.done : '') + (active ? ' ' + styles.active : '')
      }
    >
      <span className={styles.check}>{done ? <CheckIcon size={10} /> : active ? '↓' : ''}</span>
      <span>{label}</span>
      {meta && <span className={styles.meta + ' mono'}>{meta}</span>}
    </div>
  );
}
