// Turns raw controller/keyboard frames into actions and analog values.
// Deterministic: the caller supplies the clock, so tests can simulate frames.

import {
  ANALOG_TRIGGER_CONTEXTS,
  CONTEXT_MAPS,
  DIRECTION_BUTTONS,
  REPEATING,
  STICK_NAV_CONTEXTS,
  rotateDirection,
  rotateVector,
  type ActionEvent,
  type Button,
  type DirButton,
  type InputContext,
  type Rotation,
} from './actions';
import { INPUT, stickVelocity, triggerValue } from './config';

export interface PadFrame {
  /** Digital buttons currently held (D-pad, face, shoulders, sticks, grips). */
  buttons: ReadonlySet<Button>;
  /** Left / right stick, x right and y down, -1..1. */
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  /** Triggers 0..1. */
  l2: number;
  r2: number;
}

export const EMPTY_FRAME: PadFrame = { buttons: new Set(), lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0 };
const NO_BUTTONS: ReadonlySet<Button> = new Set();

export interface AnalogOutput {
  /** Vertical scroll velocity from either stick, px/s (positive = down). */
  scroll: number;
  /** Horizontal pan velocity from either stick, px/s (positive = right). */
  panX: number;
  /** Signed zoom drive, -1..1 (R2 − L2 after deadzone). */
  zoom: number;
}

export interface EngineOutput {
  events: ActionEvent[];
  analog: AnalogOutput;
  /** True when anything moved or was held this frame (keeps the loop awake). */
  active: boolean;
}

interface HeldState {
  since: number;
  nextRepeat: number;
}

/** Merge several frames (e.g. gamepad + keyboard) into one. */
export function mergeFrames(...frames: PadFrame[]): PadFrame {
  const buttons = new Set<Button>();
  let out: PadFrame = { ...EMPTY_FRAME, buttons };
  for (const f of frames) {
    f.buttons.forEach((b) => buttons.add(b));
    out = {
      buttons,
      lx: absMax(out.lx, f.lx),
      ly: absMax(out.ly, f.ly),
      rx: absMax(out.rx, f.rx),
      ry: absMax(out.ry, f.ry),
      l2: Math.max(out.l2, f.l2),
      r2: Math.max(out.r2, f.r2),
    };
  }
  return out;
}

function absMax(a: number, b: number): number {
  return Math.abs(b) > Math.abs(a) ? b : a;
}

export class InputEngine {
  private held = new Map<Button, HeldState>();
  private triggerDown = { L2: false, R2: false };
  private stickDir: DirButton | null = null;

  /** Forget held state, e.g. when the context changes under a held button. */
  reset(): void {
    this.held.clear();
    this.stickDir = null;
    this.triggerDown = { L2: false, R2: false };
  }

  /**
   * `forced` lists buttons that were pressed since the last frame by an event
   * source (keyboard). They count as fresh presses even if the engine never saw
   * them released, so quick double taps between two polls aren't lost.
   */
  update(frame: PadFrame, now: number, context: InputContext, rotation: Rotation = 'none', forced: ReadonlySet<Button> = NO_BUTTONS): EngineOutput {
    const events: ActionEvent[] = [];
    const map = CONTEXT_MAPS[context];
    const pressed = new Set<Button>();
    for (const b of forced) {
      const r = (DIRECTION_BUTTONS as readonly string[]).includes(b) ? rotateDirection(b as DirButton, rotation) : b;
      this.held.delete(r);
    }

    // 1. Digital buttons, with D-pad directions rotated for tate mode.
    frame.buttons.forEach((b) => {
      if ((DIRECTION_BUTTONS as readonly string[]).includes(b)) {
        pressed.add(rotateDirection(b as DirButton, rotation));
      } else {
        pressed.add(b);
      }
    });

    // 2. Triggers as digital buttons, with hysteresis (library filters).
    const analogTriggers = ANALOG_TRIGGER_CONTEXTS.has(context);
    for (const t of ['L2', 'R2'] as const) {
      const v = t === 'L2' ? frame.l2 : frame.r2;
      const was = this.triggerDown[t];
      const down = was ? v > INPUT.triggerRelease : v > INPUT.triggerPress;
      this.triggerDown[t] = down;
      if (down && !analogTriggers) pressed.add(t);
    }

    // 3. Left stick as a direction (dominant axis) where it navigates.
    const left = rotateVector(frame.lx, frame.ly, rotation);
    if (STICK_NAV_CONTEXTS.has(context)) {
      const mag = Math.hypot(left.x, left.y);
      let dir: DirButton | null = null;
      if (mag >= INPUT.stickNavThreshold) {
        dir = Math.abs(left.x) > Math.abs(left.y) ? (left.x > 0 ? 'Right' : 'Left') : left.y > 0 ? 'Down' : 'Up';
      } else if (this.stickDir && mag >= INPUT.stickNavThreshold * 0.8) {
        dir = this.stickDir; // small hysteresis so it doesn't chatter at the threshold
      }
      this.stickDir = dir;
      if (dir) pressed.add(dir);
    } else {
      this.stickDir = null;
    }

    // 4. Edges and repeats.
    for (const b of pressed) {
      const action = map[b];
      const state = this.held.get(b);
      if (!state) {
        this.held.set(b, { since: now, nextRepeat: now + INPUT.repeatDelayMs });
        if (action) events.push({ action, repeat: false, button: b });
      } else if (REPEATING.has(b) && now >= state.nextRepeat) {
        state.nextRepeat += INPUT.repeatIntervalMs;
        if (state.nextRepeat <= now) state.nextRepeat = now + INPUT.repeatIntervalMs; // slow frames: one repeat each
        if (action) events.push({ action, repeat: true, button: b });
      }
    }
    for (const b of [...this.held.keys()]) if (!pressed.has(b)) this.held.delete(b);

    // 5. Analog outputs. In the reader both sticks do the same: up/down scrolls,
    // left/right pans (where the page is wider than the screen). Each axis has its
    // own deadzone, so a push straight up doesn't drift sideways, and two sticks
    // together never go faster than one.
    const right = rotateVector(frame.rx, frame.ry, rotation);
    const reader = context === 'reader';
    const both = (a: number, b: number, max: number) => (reader ? clampAbs(stickVelocity(a, max) + stickVelocity(b, max), max) : 0);
    const scroll = both(left.y, right.y, INPUT.scrollMaxPxPerSec);
    const panX = both(left.x, right.x, INPUT.panMaxPxPerSec);
    const zoom = analogTriggers ? triggerValue(frame.r2) - triggerValue(frame.l2) : 0;

    const active =
      pressed.size > 0 ||
      scroll !== 0 ||
      panX !== 0 ||
      zoom !== 0 ||
      Math.hypot(frame.lx, frame.ly) > INPUT.stickDeadzone ||
      Math.hypot(frame.rx, frame.ry) > INPUT.stickDeadzone ||
      frame.l2 > INPUT.triggerDeadzone ||
      frame.r2 > INPUT.triggerDeadzone;

    return { events, analog: { scroll, panX, zoom }, active };
  }
}

/** Limit |v| to `max`, keeping the sign. */
function clampAbs(v: number, max: number): number {
  return Math.max(-max, Math.min(max, v));
}
