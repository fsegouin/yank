const FALLBACK = 'av-g4';

export function avatarGradient(seed: string): string {
  if (!seed) return FALLBACK;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `av-g${(h % 8) + 1}`;
}
