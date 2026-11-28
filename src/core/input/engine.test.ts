import { describe, expect, it } from 'vitest';
import type { Button } from './actions';
import { INPUT, stickVelocity, triggerValue, zoomFactor } from './config';
import { EMPTY_FRAME, InputEngine, mergeFrames, type PadFrame } from './engine';

const frame = (buttons: Button[] = [], rest: Partial<PadFrame> = {}): PadFrame => ({
  ...EMPTY_FRAME,
  buttons: new Set(buttons),
  ...rest,
});

/** Run frames every `step` ms from t=0 to `until`, collecting action names. */
function hold(engine: InputEngine, f: PadFrame, until: number, step = 10, ctx: Parameters<InputEngine['update']>[2] = 'library') {
  const out: { t: number; action: string; repeat: boolean }[] = [];
  for (let t = 0; t <= until; t += step) {
    for (const e of engine.update(f, t, ctx).events) out.push({ t, action: e.action, repeat: e.repeat });
  }
  return out;
}

describe('InputEngine', () => {
  it('fires a press once, then repeats after 350 ms every 90 ms', () => {
    const ev = hold(new InputEngine(), frame(['Down']), 700);
    expect(ev.map((e) => e.t)).toEqual([0, 350, 440, 530, 620]);
    expect(ev[0]).toMatchObject({ action: 'nav_down', repeat: false });
    expect(ev.slice(1).every((e) => e.repeat)).toBe(true);
  });

  it('does not repeat face buttons or shoulders', () => {
    const ev = hold(new InputEngine(), frame(['A', 'R1']), 1000);
    expect(ev.map((e) => e.action).sort()).toEqual(['confirm', 'tab_next']);
  });

  it('emits again after release and re-press', () => {
    const eng = new InputEngine();
    expect(eng.update(frame(['A']), 0, 'library').events).toHaveLength(1);
    expect(eng.update(frame(), 16, 'library').events).toHaveLength(0);
    expect(eng.update(frame(['A']), 32, 'library').events).toHaveLength(1);
  });

  it('counts a forced re-press even if no release frame was seen', () => {
    const eng = new InputEngine();
    expect(eng.update(frame(['Down']), 0, 'library').events).toHaveLength(1);
    // Released and pressed again between polls: the frame still shows it held.
    const again = eng.update(frame(['Down']), 50, 'library', 'none', new Set(['Down']));
    expect(again.events).toEqual([{ action: 'nav_down', repeat: false, button: 'Down' }]);
    // And the repeat timer restarts from the new press.
    expect(eng.update(frame(['Down']), 360, 'library').events).toHaveLength(0);
  });

  it('maps the same button differently per context', () => {
    const lib = new InputEngine().update(frame(['R1']), 0, 'library').events[0]!.action;
    const reader = new InputEngine().update(frame(['R1']), 0, 'reader').events[0]!.action;
    const details = new InputEngine().update(frame(['R1']), 0, 'details').events[0]!.action;
    expect([lib, reader, details]).toEqual(['tab_next', 'page_next', 'stage_next']);
  });

  it('turns pages with the D-pad and back grips in the reader', () => {
    const eng = new InputEngine();
    const acts = eng.update(frame(['Left', 'R4', 'L5']), 0, 'reader').events.map((e) => e.action).sort();
    expect(acts).toEqual(['page_next', 'page_prev', 'stage_prev']);
  });

  it('uses the left stick for navigation past the threshold in the library', () => {
    const eng = new InputEngine();
    expect(eng.update(frame([], { lx: 0.4 }), 0, 'library').events).toHaveLength(0);
    expect(eng.update(frame([], { lx: 0.7 }), 16, 'library').events[0]?.action).toBe('nav_right');
  });

  it('uses the left stick for analog scroll in the reader, not navigation', () => {
    const out = new InputEngine().update(frame([], { ly: 1 }), 0, 'reader');
    expect(out.events).toHaveLength(0);
    expect(out.analog.scroll).toBeCloseTo(INPUT.scrollMaxPxPerSec);
  });

  it('gives both sticks both directions in the reader', () => {
    const up = (rest: Partial<PadFrame>) => new InputEngine().update(frame([], rest), 0, 'reader').analog;
    // Left stick sideways pans; right stick up/down scrolls at the same speed as the left.
    expect(up({ lx: 1 }).panX).toBeCloseTo(INPUT.panMaxPxPerSec);
    expect(up({ ry: -1 }).scroll).toBeCloseTo(-INPUT.scrollMaxPxPerSec);
    expect(up({ rx: -1 }).panX).toBeCloseTo(-INPUT.panMaxPxPerSec);
    // A push mostly up with a little sideways drift doesn't pan (per-axis deadzone).
    const drift = up({ ly: -1, lx: 0.2 });
    expect(drift.panX).toBe(0);
    expect(drift.scroll).toBeCloseTo(-INPUT.scrollMaxPxPerSec);
    // Both sticks the same way: no faster than one; opposite ways cancel.
    expect(up({ ly: 1, ry: 1 }).scroll).toBeCloseTo(INPUT.scrollMaxPxPerSec);
    expect(up({ lx: 1, rx: -1 }).panX).toBeCloseTo(0);
    // Outside the reader the sticks don't scroll or pan.
    const lib = new InputEngine().update(frame([], { rx: 1, ry: 1 }), 0, 'library').analog;
    expect([lib.scroll, lib.panX]).toEqual([0, 0]);
  });

  it('treats triggers as buttons in the library and as zoom in the reader', () => {
    const lib = new InputEngine().update(frame([], { r2: 0.9 }), 0, 'library');
    expect(lib.events[0]?.action).toBe('filter_next');
    const reader = new InputEngine().update(frame([], { r2: 1, l2: 0 }), 0, 'reader');
    expect(reader.events).toHaveLength(0);
    expect(reader.analog.zoom).toBeCloseTo(1);
  });

  it('applies trigger hysteresis', () => {
    const eng = new InputEngine();
    expect(eng.update(frame([], { l2: 0.6 }), 0, 'library').events).toHaveLength(1);
    // Dropping to 0.4 stays pressed (release at 0.3), so no new edge on 0.6.
    eng.update(frame([], { l2: 0.4 }), 16, 'library');
    expect(eng.update(frame([], { l2: 0.6 }), 32, 'library').events).toHaveLength(0);
    eng.update(frame([], { l2: 0.2 }), 48, 'library');
    expect(eng.update(frame([], { l2: 0.6 }), 64, 'library').events).toHaveLength(1);
  });

  it('rotates the D-pad in tate-left so physical Right is up', () => {
    const out = new InputEngine().update(frame(['Right']), 0, 'library', 'tate-left');
    expect(out.events[0]?.action).toBe('nav_up');
    const r = new InputEngine().update(frame(['Left']), 0, 'library', 'tate-right');
    expect(r.events[0]?.action).toBe('nav_up');
  });

  it('rotates the left stick in tate mode for scrolling', () => {
    // Tate-L: pushing the stick physically right means "up the page".
    const out = new InputEngine().update(frame([], { lx: 1 }), 0, 'reader', 'tate-left');
    expect(out.analog.scroll).toBeLessThan(0);
  });

  it('merges keyboard and gamepad frames', () => {
    const m = mergeFrames(frame(['A'], { lx: 0.2 }), frame(['B'], { lx: -0.8, r2: 1 }));
    expect([...m.buttons].sort()).toEqual(['A', 'B']);
    expect(m.lx).toBe(-0.8);
    expect(m.r2).toBe(1);
  });
});

describe('curves', () => {
  it('has a stick deadzone of 0.25', () => {
    expect(stickVelocity(0.25, 1000)).toBe(0);
    expect(stickVelocity(-1, 1000)).toBe(-1000);
    expect(stickVelocity(0.625, 1000)).toBeCloseTo(1000 * Math.pow(0.5, 1.6));
  });

  it('has a trigger deadzone of 0.08', () => {
    expect(triggerValue(0.05)).toBe(0);
    expect(triggerValue(1)).toBe(1);
  });

  it('zooms in and out symmetrically', () => {
    expect(zoomFactor(1, 1) * zoomFactor(-1, 1)).toBeCloseTo(1);
    expect(zoomFactor(0, 1)).toBe(1);
  });
});
