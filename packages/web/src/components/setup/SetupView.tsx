import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useEventStream } from '../../lib/eventStream.js';
import { apiFetch } from '../../lib/api.js';
import { CheckIcon } from '../icons/index.js';
import styles from './SetupView.module.css';

type Stage = 'phone' | 'pair' | 'syncing' | 'done';

interface Progress {
  chats: number;
  messages: number;
}

const digitsOnly = (s: string) => /^\d{6,15}$/.test(s);

export function SetupView() {
  const [stage, setStage] = useState<Stage>('phone');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [code, setCode] = useState<string>('');
  const [progress, setProgress] = useState<Progress>({ chats: 0, messages: 0 });
  const navigate = useNavigate();

  useEventStream({
    onEvent: (evt) => {
      if (evt.type === 'pair-code') setCode(evt.code);
      else if (evt.type === 'qr') {
        // Pre-pairing QR data — opaque payload, not useful in the pair-code flow.
        // We don't render it. (Future: render as actual QR image for QR-flow users.)
      } else if (evt.type === 'connected') setStage('syncing');
      else if (evt.type === 'sync-progress')
        setProgress({ chats: evt.synced, messages: evt.total ?? 0 });
      else if (evt.type === 'sync-complete') setStage('done');
    },
  });

  const onSubmitPhone = async () => {
    if (!digitsOnly(phone)) {
      setPhoneError('Enter your number in international format, digits only (e.g. 447700900001)');
      return;
    }
    setPhoneError(null);
    setStage('pair');
    await apiFetch<void>('/api/setup/link', {
      method: 'POST',
      body: { method: 'code', phoneNumber: phone },
    });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.logo}>yk</div>
        <h1 className={styles.heading}>Link your WhatsApp</h1>

        {stage === 'phone' ? (
          <>
            <p className={styles.lede}>
              Enter your WhatsApp phone number in international format, digits only.
            </p>
            <input
              className={styles.phoneInput}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]+"
              placeholder="447700900001"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onSubmitPhone();
              }}
              aria-invalid={phoneError !== null}
              aria-describedby={phoneError ? 'phone-error' : undefined}
            />
            {phoneError && (
              <div id="phone-error" className={styles.error} role="alert">
                {phoneError}
              </div>
            )}
            <button type="button" className={styles.cta} onClick={() => void onSubmitPhone()}>
              Continue →
            </button>
          </>
        ) : (
          <>
            <p className={styles.lede}>
              Open WhatsApp →{' '}
              <span className="mono">Settings → Linked Devices → Link a device</span> → Link with
              phone number, then enter this code on your phone.
            </p>

            <div className={styles.code} aria-live="polite">
              {code ? (
                code.match(/.{1,3}/g)?.map((chunk, i) => (
                  <span key={i} className={styles.chunk}>
                    {chunk}
                  </span>
                ))
              ) : (
                <span className={styles.chunk}>…</span>
              )}
            </div>

            <div className={styles.progress}>
              <Step label="Daemon online" done={true} />
              <Step
                label={stage === 'pair' ? 'Waiting for phone…' : 'Linked to phone'}
                done={stage !== 'pair'}
              />
              <Step
                label="Syncing history"
                done={stage === 'done'}
                active={stage === 'syncing'}
                meta={`${progress.chats} chats · ${progress.messages.toLocaleString()} msgs`}
              />
              <Step label="Done" done={stage === 'done'} />
            </div>

            {stage === 'done' && (
              <button
                type="button"
                className={styles.cta}
                onClick={() => void navigate({ to: '/triage' })}
              >
                Open Triage →
              </button>
            )}
          </>
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
