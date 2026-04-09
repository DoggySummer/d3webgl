const Y_AXIS_HARD_MIN = -50;
const Y_AXIS_HARD_MAX = 60;

export function clampYRange(min: number, max: number): { min: number; max: number } {
  let lo = min;
  let hi = max;
  if (!(hi > lo)) return { min: -10, max: 40 };
  const span = hi - lo;
  if (lo < Y_AXIS_HARD_MIN) {
    lo = Y_AXIS_HARD_MIN;
    hi = lo + span;
  }
  if (hi > Y_AXIS_HARD_MAX) {
    hi = Y_AXIS_HARD_MAX;
    lo = hi - span;
  }
  if (lo < Y_AXIS_HARD_MIN) lo = Y_AXIS_HARD_MIN;
  return { min: lo, max: hi };
}

export function initialYRangeFromTemps(temps: number[]): { min: number; max: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < temps.length; i++) {
    const t = temps[i];
    if (!Number.isFinite(t)) continue;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  if (lo === Infinity) return { min: -10, max: 40 };
  if (lo === hi) {
    lo -= 2;
    hi += 2;
  }
  const pad = Math.max((hi - lo) * 0.12, 1);
  return clampYRange(lo - pad, hi + pad);
}

export function countVisiblePoints(timestamps: number[], minMs: number, maxMs: number): number {
  let count = 0;
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i] >= minMs && timestamps[i] <= maxMs) count++;
  }
  return count;
}

