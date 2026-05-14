/* Inline SVG icons — minimal, monoline. Keep them small. */
const I = {
  search: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  ),
  hash: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M5.5 2.5 4 13.5M11.5 2.5 10 13.5M2.5 5.5h11M2.5 10.5h11" />
    </svg>
  ),
  at: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M11 8v1.5a2 2 0 0 0 4 0V8a7 7 0 1 0-2.5 5.4" />
    </svg>
  ),
  bookmark: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M4 2.5h8v11l-4-2.5L4 13.5z" />
    </svg>
  ),
  grid: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.5" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="0.5" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="0.5" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="0.5" />
    </svg>
  ),
  inbox: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 9.5 4 3h8l1.5 6.5M2.5 9.5v3.5h11V9.5M2.5 9.5h3.5l1 1.5h2l1-1.5h3.5" />
    </svg>
  ),
  settings: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </svg>
  ),
  activity: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 8h3l1.5-5 3 10 1.5-5h4" />
    </svg>
  ),
  directory: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4.5h3l1 1.5h7v6.5h-11z" />
    </svg>
  ),
  chevron: (s = 12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 3 4 3-4 3" />
    </svg>
  ),
  chevronDown: (s = 12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 4 3 4 3-4" />
    </svg>
  ),
  reply: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 5 3 8l3 3M3 8h7a3 3 0 0 1 3 3v1" />
    </svg>
  ),
  emoji: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="6" cy="7" r="0.5" fill="currentColor" />
      <circle cx="10" cy="7" r="0.5" fill="currentColor" />
      <path d="M5.5 9.5c.5 1 1.5 1.5 2.5 1.5s2-.5 2.5-1.5" />
    </svg>
  ),
  paperclip: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 10a2 2 0 0 0 3 3l5-5a3.5 3.5 0 0 0-5-5L4 8.5a5 5 0 0 0 7 7L14 13" />
    </svg>
  ),
  mic: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2" width="4" height="8" rx="2" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2" />
    </svg>
  ),
  send: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 8 12-5.5L8 14l-1.5-4.5L2 8z" />
    </svg>
  ),
  pin: (s = 12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1 11 5 8 6l-1 4-2-2-3.5 3.5L2 11l3.5-3.5L4 5l4-1z" />
    </svg>
  ),
  check: (s = 12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2.5 6 2.5 2.5L9.5 3.5" />
    </svg>
  ),
  doubleCheck: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 8 2.5 2.5L9 6M7 8l2.5 2.5L14 6" />
    </svg>
  ),
  clock: (s = 12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="4.5" />
      <path d="M6 3.5V6l1.5 1" />
    </svg>
  ),
  x: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  ),
  more: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3.5" cy="8" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="12.5" cy="8" r="1.2" />
    </svg>
  ),
  thread: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 3.5h11M2.5 7h11M2.5 10.5h6.5M9 10.5 7.5 12M9 10.5 7.5 9" />
    </svg>
  ),
  star: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="m8 2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2 4.4 13.1l.7-4-2.9-2.8 4-.6z" />
    </svg>
  ),
  starFill: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor">
      <path d="m8 2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2 4.4 13.1l.7-4-2.9-2.8 4-.6z" />
    </svg>
  ),
  archive: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="3" rx="0.5" />
      <path d="M3 6v7h10V6M6 9h4" />
    </svg>
  ),
  filter: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12l-4.5 5.5V13l-3-1.5V9.5z" />
    </svg>
  ),
  play: (s = 10) => (
    <svg width={s} height={s} viewBox="0 0 10 10" fill="currentColor">
      <path d="M3 2v6l5-3z" />
    </svg>
  ),
  plus: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  ),
  muted: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6v4a1.5 1.5 0 0 0 1.5 1.5h2L9 13.5V2.5L6.5 4.5h-2A1.5 1.5 0 0 0 3 6z" />
      <path d="m11.5 5.5 3 3M14.5 5.5l-3 3" />
    </svg>
  ),
  phone: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.4" />
      <path d="M7 12.5h2" />
    </svg>
  ),
  bold: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M4.5 2.5h4.2a2.5 2.5 0 0 1 0 5H4.5zM4.5 7.5h5a2.5 2.5 0 0 1 0 5h-5z" />
    </svg>
  ),
  italic: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M10 2.5h3M3 13.5h3M9.5 2.5l-3 11" />
    </svg>
  ),
  strike: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M2 8h12M5 4.5h6M5 11.5h6" />
    </svg>
  ),
  code: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10.5 4 3 4-3 4M5.5 4l-3 4 3 4" />
    </svg>
  ),
  link: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 9.5a3 3 0 0 0 4.24 0l2-2a3 3 0 1 0-4.24-4.24L7.5 4.25" />
      <path d="M9.5 6.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 1 0 4.24 4.24l1-1" />
    </svg>
  ),
  blockquote: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5h4v4H2zM10 4.5h4v4h-4z" />
      <path d="M6 8.5c0 2-1.5 3-3 3M14 8.5c0 2-1.5 3-3 3" />
    </svg>
  ),
  list: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="3" cy="4" r="0.7" fill="currentColor" />
      <circle cx="3" cy="8" r="0.7" fill="currentColor" />
      <circle cx="3" cy="12" r="0.7" fill="currentColor" />
      <path d="M6 4h8M6 8h8M6 12h8" />
    </svg>
  ),
};

window.I = I;
