// Inline stroke icons (§10.6). No emoji anywhere.

import type { CSSProperties } from 'react';

interface P {
  size?: number;
  color?: string;
  stroke?: number;
  style?: CSSProperties;
}

export const BookLogo = ({ size = 30, color = '#58C7E6' }: P) => (
  <svg width={size} height={size} viewBox="0 0 30 30" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 8c-3-2-7-2.5-11-2v17c4-.5 8 0 11 2 3-2 7-2.5 11-2V6c-4-.5-8 0-11 2z" />
    <path d="M15 8v17" />
  </svg>
);

export const Flame = ({ size = 18, color = '#F5B947' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2.5c.8 3.6 5 5.8 5 11a5 5 0 0 1-10 0c0-2 .8-3.4 1.8-4.5.3 1.8 1.2 2.8 2.3 3.2-.4-3.5 0-6.6.9-9.7z" />
  </svg>
);

export const Check = ({ size = 14, color = '#1A1405', stroke = 3 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const Clock = ({ size = 15, color = '#A6AECB' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9 2h6" />
  </svg>
);

export const TwoColumn = ({ size = 22, color = '#58C7E6' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none', marginTop: 1 }}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M12 3v18M6.5 8h3M6.5 12h3M6.5 16h3M14.5 8h3M14.5 12h3M14.5 16h3" />
  </svg>
);

export const ChevronLeft = ({ size = 18, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const ChevronRight = ({ size = 18, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const Trophy = ({ size = 26, color = '#F5B947' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
    <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" />
  </svg>
);

export const CalendarCheck = ({ size = 22, color = '#F5B947' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4" />
  </svg>
);

export const BookmarkIcon = ({ size = 18, color = '#58C7E6' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3.5h12v17l-6-4.5-6 4.5z" />
  </svg>
);

export const Folder = ({ size = 22, color = '#A6AECB' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
  </svg>
);

/** Arrow into a tray: software updates. */
export const DownloadIcon = ({ size = 18, color = '#58C7E6' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 16.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
  </svg>
);

export const Spinner = ({ size = 18, color = '#58C7E6' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" style={{ animation: 'spin 900ms linear infinite' }}>
    <path d="M12 3a9 9 0 1 1-9 9" />
  </svg>
);

export const ViewIcon = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="1" y="1" width="8" height="8" rx="1.5" />
    <rect x="5" y="5" width="8" height="8" rx="1.5" />
  </svg>
);

export const MenuIcon = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M2 3.5h10M2 7h10M2 10.5h10" />
  </svg>
);

export const DpadIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M6 1h4v5h5v4h-5v5H6v-5H1V6h5z" />
  </svg>
);
