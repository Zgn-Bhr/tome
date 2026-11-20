// Timing and curve constants (spec §6.4). Every tunable lives here.

export const INPUT = {
  repeatDelayMs: 350,
  repeatIntervalMs: 90,
  stickDeadzone: 0.25,
  stickNavThreshold: 0.5,
  triggerDeadzone: 0.08,
  /** Digital trigger press/release thresholds (library filter chips). */
  triggerPress: 0.5,
  triggerRelease: 0.3,
  scrollMaxPxPerSec: 2400,
  panMaxPxPerSec: 1800,
  curveExponent: 1.6,
  zoomRate: 1.6,
  zoomMin: 0.5,
  zoomMax: 4,
  edgeBumpMs: 150,
  edgeBumpPx: 8,
  /** Fraction of the viewport one D-pad scroll step moves. */
  scrollStep: 0.8,
  /** Drop the poll loop to ~20 Hz after this long without input. */
  idleAfterMs: 10_000,
  idlePollMs: 50,
} as const;

/** Stick speed curve: v = max × ((|a| − dz) / (1 − dz))^1.6, signed. */
export function stickVelocity(axis: number, maxPxPerSec: number): number {
  const a = Math.abs(axis);
  const dz = INPUT.stickDeadzone;
  if (a <= dz) return 0;
  const t = Math.min(1, (a - dz) / (1 - dz));
  return Math.sign(axis) * maxPxPerSec * Math.pow(t, INPUT.curveExponent);
}

/** Trigger value after its deadzone, rescaled to 0..1. */
export function triggerValue(raw: number): number {
  const dz = INPUT.triggerDeadzone;
  if (raw <= dz) return 0;
  return Math.min(1, (raw - dz) / (1 - dz));
}

/** Multiplicative zoom step for one frame: zoom *= exp(1.6 × t² × dt), signed by t. */
export function zoomFactor(t: number, dtSec: number): number {
  return Math.exp(Math.sign(t) * INPUT.zoomRate * t * t * dtSec);
}
