// Polls the gamepad and keyboard, runs core/input, and hands actions to the
// top-most registered handler (overlays capture all input, §6.3).

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { ActionEvent, Button, InputContext, Rotation } from '../../core/input/actions';
import { INPUT } from '../../core/input/config';
import { EMPTY_FRAME, InputEngine, mergeFrames, type AnalogOutput, type PadFrame } from '../../core/input/engine';
import { keyMap, normaliseKey } from '../../core/input/keyboard';
import { store } from '../store';

export interface InputHandler {
  context: InputContext;
  onAction: (e: ActionEvent) => void;
  /** Called every frame with analog values while this handler is on top. */
  onFrame?: (analog: AnalogOutput, dtSec: number, now: number) => void;
  /**
   * Text-input mode: while this handler is on top, typed characters (from a
   * keyboard or Steam's own) arrive here instead of acting as buttons.
   */
  onText?: (t: string | { key: 'backspace' | 'enter' | 'left' | 'right' }) => void;
}

interface Entry {
  id: number;
  handler: { current: InputHandler };
}

interface InputApi {
  register(handler: { current: InputHandler }): () => void;
  /** Keep polling at full rate until `untilMs` (for animations). */
  keepAwake(untilMs: number): void;
  setRotation(r: Rotation): void;
  /** Time of the last input of any kind (for the idle cap, §9.2). */
  lastInputAt(): number;
  rumble(kind: 'tick' | 'double'): void;
  gamepads(): string[];
}

const Ctx = createContext<InputApi | null>(null);

const PAD_BUTTONS: [number, Button][] = [
  [0, 'A'],
  [1, 'B'],
  [2, 'X'],
  [3, 'Y'],
  [4, 'L1'],
  [5, 'R1'],
  [8, 'View'],
  [9, 'Menu'],
  [10, 'L3'],
  [11, 'R3'],
  [12, 'Up'],
  [13, 'Down'],
  [14, 'Left'],
  [15, 'Right'],
];

function padFrame(gp: Gamepad): PadFrame {
  const buttons = new Set<Button>();
  for (const [i, b] of PAD_BUTTONS) if (gp.buttons[i]?.pressed) buttons.add(b);
  return {
    buttons,
    lx: gp.axes[0] ?? 0,
    ly: gp.axes[1] ?? 0,
    rx: gp.axes[2] ?? 0,
    ry: gp.axes[3] ?? 0,
    l2: gp.buttons[6]?.value ?? 0,
    r2: gp.buttons[7]?.value ?? 0,
  };
}

function padSignature(gp: Gamepad): string {
  return gp.buttons.map((b) => (b.pressed ? '1' : b.value > 0.05 ? 'v' : '0')).join('') + gp.axes.map((a) => (Math.abs(a) > 0.2 ? Math.sign(a) : 0)).join('');
}

export function InputProvider({ children }: { children: ReactNode }) {
  const stack = useRef<Entry[]>([]);
  const nextId = useRef(1);
  const awakeUntil = useRef(0);
  const rotation = useRef<Rotation>('none');
  const lastInput = useRef(performance.now());
  const activePad = useRef<number | null>(null);
  const apiRef = useRef<InputApi | null>(null);

  if (!apiRef.current) {
    apiRef.current = {
      register(handler) {
        const id = nextId.current++;
        stack.current.push({ id, handler });
        return () => {
          stack.current = stack.current.filter((e) => e.id !== id);
        };
      },
      keepAwake(until) {
        awakeUntil.current = Math.max(awakeUntil.current, until);
      },
      setRotation(r) {
        rotation.current = r;
      },
      lastInputAt: () => lastInput.current,
      rumble(kind) {
        if (!store.get().settings.haptics || activePad.current === null) return;
        const gp = navigator.getGamepads()[activePad.current];
        const act = gp?.vibrationActuator;
        if (!act) return;
        const tick = () => act.playEffect('dual-rumble', { duration: 18, strongMagnitude: 0, weakMagnitude: 0.35 }).catch(() => {});
        tick();
        if (kind === 'double') setTimeout(tick, 90);
      },
      gamepads: () =>
        navigator
          .getGamepads()
          .filter((g): g is Gamepad => !!g)
          .map((g) => `${g.index}: ${g.id} [${g.mapping || 'no mapping'}]${g.index === activePad.current ? ' ← active' : ''}`),
    };
  }

  useEffect(() => {
    const engine = new InputEngine();
    const keys = new Set<Button>();
    // Keys pressed since the last frame: a tap shorter than a frame still registers once.
    const tapped = new Set<Button>();
    const signatures = new Map<number, string>();
    let last = performance.now();
    let timer: number | null = null;
    let raf: number | null = null;
    let stopped = false;

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave OS / devtools shortcuts alone
      const text = stack.current[stack.current.length - 1]?.handler.current.onText;
      if (text) {
        const special = e.key === 'Backspace' ? 'backspace' : e.key === 'Enter' ? 'enter' : null;
        if (e.key.length === 1 || special) {
          e.preventDefault();
          lastInput.current = performance.now();
          if (down) text(special ? { key: special } : e.key);
          return;
        }
      }
      const map = keyMap(store.get().settings.backGripKeys);
      const b = map[normaliseKey(e.key)];
      if (!b) return;
      e.preventDefault();
      lastInput.current = performance.now();
      if (down) {
        if (!keys.has(b)) tapped.add(b);
        keys.add(b);
      } else keys.delete(b);
      schedule(true);
    };
    const keydown = onKey(true);
    const keyup = onKey(false);
    const blur = () => keys.clear();
    const wake = () => {
      lastInput.current = performance.now();
      schedule(true);
    };

    function pickPad(): Gamepad | null {
      const pads = navigator.getGamepads().filter((g): g is Gamepad => !!g && g.connected);
      if (!pads.length) return null;
      // The standard-mapped pad that most recently had input wins (§6.2).
      const hasStandard = pads.some((g) => g.mapping === 'standard');
      for (const gp of pads) {
        const sig = padSignature(gp);
        const changed = signatures.get(gp.index) !== sig;
        signatures.set(gp.index, sig);
        if (changed && /[1v]/.test(sig) && (gp.mapping === 'standard' || !hasStandard)) activePad.current = gp.index;
      }
      return pads.find((g) => g.index === activePad.current) ?? pads.find((g) => g.mapping === 'standard') ?? pads[0]!;
    }

    function tick() {
      raf = null;
      timer = null;
      if (stopped) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const gp = pickPad();
      // Keyboard Z/C act as fully pulled triggers (§6.5).
      const held = new Set([...keys, ...tapped]);
      const forced = new Set(tapped);
      tapped.clear();
      const kbButtons = new Set(held);
      kbButtons.delete('L2');
      kbButtons.delete('R2');
      const kb: PadFrame = { ...EMPTY_FRAME, buttons: kbButtons, l2: held.has('L2') ? 1 : 0, r2: held.has('R2') ? 1 : 0 };
      const frame = mergeFrames(gp ? padFrame(gp) : EMPTY_FRAME, kb);
      const top = stack.current[stack.current.length - 1];
      const out = engine.update(frame, now, top?.handler.current.context ?? 'library', rotation.current, forced);
      if (out.active) lastInput.current = now;
      for (const ev of out.events) {
        const h = stack.current[stack.current.length - 1];
        h?.handler.current.onAction(ev);
      }
      const after = stack.current[stack.current.length - 1];
      after?.handler.current.onFrame?.(out.analog, dt, now);
      schedule(false);
    }

    function schedule(immediate: boolean) {
      if (stopped) return;
      if (immediate) {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (raf === null) raf = requestAnimationFrame(tick);
        return;
      }
      if (raf !== null || timer !== null) return;
      const now = performance.now();
      const idle = now - lastInput.current > INPUT.idleAfterMs && now > awakeUntil.current;
      // Idle: drop to ~20 Hz to save battery (§6.2).
      if (idle) timer = window.setTimeout(tick, INPUT.idlePollMs);
      else raf = requestAnimationFrame(tick);
    }

    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    window.addEventListener('gamepadconnected', wake);
    window.addEventListener('wheel', wake, { passive: true });
    window.addEventListener('pointermove', wake, { passive: true });
    schedule(true);
    return () => {
      stopped = true;
      if (raf !== null) cancelAnimationFrame(raf);
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      window.removeEventListener('gamepadconnected', wake);
      window.removeEventListener('wheel', wake);
      window.removeEventListener('pointermove', wake);
    };
  }, []);

  return <Ctx.Provider value={apiRef.current}>{children}</Ctx.Provider>;
}

export function useInputApi(): InputApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('InputProvider missing');
  return v;
}

/**
 * Register an input handler while `enabled`. The most recently enabled
 * handler is on top and receives everything.
 */
export function useInput(handler: InputHandler, enabled = true): void {
  const api = useInputApi();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    return api.register(ref);
  }, [api, enabled]);
}
