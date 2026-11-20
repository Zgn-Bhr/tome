// Design tokens (spec §10). Gold = earned/done. Cyan = here/now/focus. Never swap them.

export const C = {
  bgBase: '#0D1120',
  bgReader: '#07090F',
  bgFooter: '#0A0E1A',
  surface1: '#161C31',
  surfaceTile: '#181E34',
  surfaceModal: '#121729',
  surfaceInset: '#10162A',
  surfaceNode: '#1A2038',
  surfaceHexInner: '#1E2238',
  surfaceButton2: '#212946',
  surfaceDot: '#232B4A',
  glyphBg: '#2B3354',
  glyphRing: '#333D66',
  glyphOutline: '#4A5478',
  glyphText: '#F2F4FA',
  line1: '#1D2440',
  line2: '#232B4A',
  line3: '#2A3356',
  line4: '#2C3558',
  track: '#262E4E',
  textPrimary: '#EEF1F8',
  textSecondary: '#C5CBE0',
  textMuted: '#A6AECB',
  textDim: '#8890AD',
  gold: '#F5B947',
  goldOn: '#1A1405',
  goldDeep: '#9C7A35',
  goldBorder: '#5B4A22',
  goldBorder2: '#8A6A2C',
  goldSurface: '#2A2312',
  goldSurface2: '#1E1A10',
  goldTextSoft: '#D9C08A',
  goldToastBorder: '#4A3E1C',
  cyan: '#58C7E6',
  readerTrack: '#1C2133',
  readerProgressTrack: '#161B2B',
  hudBar: 'rgba(10,13,24,0.95)',
  hudPanel: 'rgba(10,13,24,0.96)',
  toastBg: 'rgba(13,17,32,0.95)',
} as const;

export const PAGE_THEMES = {
  paper: { bg: '#F4EEE1', label: 'PAPER' },
  sepia: { bg: '#E9D9BC', label: 'SEPIA' },
  night: { bg: '#171A22', label: 'NIGHT', ink: '#D8D2C4' },
  dim: { bg: '#999999', label: 'DIM' },
} as const;

export const FONT = {
  chakra: "'Chakra Petch', sans-serif",
  inter: 'Inter, system-ui, sans-serif',
  literata: 'Literata, Georgia, serif',
  mono: 'ui-monospace, Menlo, monospace',
} as const;

/** CSS `font` shorthand in Chakra Petch. */
export const chakra = (weight: 500 | 600 | 700, size: number, lineHeight: number | string = 1) =>
  `${weight} ${size}px/${lineHeight} ${FONT.chakra}`;

export const HEX = 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)';
export const VHEX = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)';

export const STAGE_W = 1280;
export const STAGE_H = 800;
