// Logical actions and per-context button maps (spec §6.1, §6.3).

export type Action =
  | 'nav_up' | 'nav_down' | 'nav_left' | 'nav_right'
  | 'confirm' | 'back' | 'secondary' | 'tertiary'
  | 'tab_prev' | 'tab_next'
  | 'filter_prev' | 'filter_next'
  | 'view' | 'menu'
  | 'page_prev' | 'page_next' | 'stage_prev' | 'stage_next'
  | 'zoom_reset'
  | 'link_back';

/** Physical controls after Steam Input, in Deck naming. */
export type Button =
  | 'A' | 'B' | 'X' | 'Y'
  | 'L1' | 'R1' | 'L2' | 'R2'
  | 'View' | 'Menu' | 'L3' | 'R3'
  | 'Up' | 'Down' | 'Left' | 'Right'
  | 'L4' | 'R4' | 'L5' | 'R5';

export type InputContext = 'library' | 'details' | 'reader' | 'overlay';

/** How the screen is rotated relative to the device (tate mode, §6.3). */
export type Rotation = 'none' | 'tate-left' | 'tate-right';

export interface ActionEvent {
  action: Action;
  /** True for auto-repeat while held; false for the initial press. */
  repeat: boolean;
  button: Button;
}

export const DIRECTION_BUTTONS = ['Up', 'Down', 'Left', 'Right'] as const;
export type DirButton = (typeof DIRECTION_BUTTONS)[number];

const NAV: Partial<Record<Button, Action>> = {
  Up: 'nav_up',
  Down: 'nav_down',
  Left: 'nav_left',
  Right: 'nav_right',
};

const FACE: Partial<Record<Button, Action>> = {
  A: 'confirm',
  B: 'back',
  X: 'secondary',
  Y: 'tertiary',
  View: 'view',
  Menu: 'menu',
};

export const CONTEXT_MAPS: Record<InputContext, Partial<Record<Button, Action>>> = {
  library: {
    ...NAV,
    ...FACE,
    L1: 'tab_prev',
    R1: 'tab_next',
    L2: 'filter_prev',
    R2: 'filter_next',
  },
  details: {
    ...NAV,
    ...FACE,
    L1: 'stage_prev',
    R1: 'stage_next',
  },
  reader: {
    ...FACE,
    Up: 'nav_up', // scroll step (§6.3)
    Down: 'nav_down',
    Left: 'page_prev',
    Right: 'page_next',
    L1: 'page_prev',
    R1: 'page_next',
    L4: 'page_prev',
    R4: 'page_next',
    L5: 'stage_prev',
    R5: 'stage_next',
    L3: 'link_back',
    R3: 'zoom_reset',
  },
  overlay: {
    ...NAV,
    ...FACE,
    L1: 'tab_prev',
    R1: 'tab_next',
  },
};

/** Contexts where the left stick moves focus like the D-pad. */
export const STICK_NAV_CONTEXTS: ReadonlySet<InputContext> = new Set(['library', 'details', 'overlay']);

/** Contexts where L2/R2 are analog (zoom) rather than digital buttons. */
export const ANALOG_TRIGGER_CONTEXTS: ReadonlySet<InputContext> = new Set(['reader']);

/** Buttons that auto-repeat while held. */
export const REPEATING: ReadonlySet<Button> = new Set(['Up', 'Down', 'Left', 'Right']);

/**
 * Rotate a physical D-pad direction into the direction the reader sees.
 * Tate-L: the device is turned 90° counter-clockwise, so physical Right
 * points to the top of the page.
 */
export function rotateDirection(b: DirButton, rotation: Rotation): DirButton {
  if (rotation === 'none') return b;
  const left: Record<DirButton, DirButton> = { Right: 'Up', Up: 'Left', Left: 'Down', Down: 'Right' };
  const right: Record<DirButton, DirButton> = { Left: 'Up', Up: 'Right', Right: 'Down', Down: 'Left' };
  return (rotation === 'tate-left' ? left : right)[b];
}

/** Rotate a stick vector (x right, y down) into screen space. */
export function rotateVector(x: number, y: number, rotation: Rotation): { x: number; y: number } {
  if (rotation === 'tate-left') return { x: y, y: -x };
  if (rotation === 'tate-right') return { x: -y, y: x };
  return { x, y };
}
