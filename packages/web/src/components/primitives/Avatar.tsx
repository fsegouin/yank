import { avatarGradient } from '../../utils/avatarGradient.js';
import styles from './Avatar.module.css';

interface AvatarProps {
  seed: string;
  initials: string;
  size?: number;
  square?: boolean;
}

export function Avatar({ seed, initials, size = 36, square = false }: AvatarProps) {
  return (
    <div
      className={`${styles.avatar} ${avatarGradient(seed)}`}
      style={{
        width: size,
        height: size,
        borderRadius: square ? size / 4 : Math.min(size / 2, 50),
        fontSize: size <= 22 ? 9.5 : size <= 30 ? 11 : 12.5,
      }}
    >
      {initials}
    </div>
  );
}
