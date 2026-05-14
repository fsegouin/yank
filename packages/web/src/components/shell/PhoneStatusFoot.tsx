import { PhoneIcon } from '../icons/index.js';
import styles from './PhoneStatusFoot.module.css';

interface Props {
  phoneNumber: string | null;
  syncedAgo: string;
  connected: boolean;
}

export function PhoneStatusFoot({ phoneNumber, syncedAgo, connected }: Props) {
  return (
    <div className={styles.foot}>
      <span className={styles.iconWrap}>
        <PhoneIcon size={14} />
        {connected && <span className={styles.ping} />}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>
          {connected ? 'WhatsApp linked' : 'WhatsApp disconnected'}
        </span>
        <span className={styles.meta}>
          {phoneNumber ?? 'no device'} · synced {syncedAgo}
        </span>
      </span>
    </div>
  );
}
