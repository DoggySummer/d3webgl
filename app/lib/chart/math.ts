// app/lib/chart/math.ts

export interface ViewRange {
  start: number;
  end: number;
}

/**
 * x축 뷰 범위를 데이터 도메인 안으로 clamp합니다.
 * domainStart/domainEnd를 넘기지 않으면 범위 제한 없이 span만 보정합니다.
 */
export function clampViewRangeMs(
  start: number,
  end: number,
  domainStart?: number,
  domainEnd?: number
): ViewRange {
  let s = Math.round(start);
  let e = Math.round(end);

  if (!(e > s)) {
    return {
      start: domainStart ?? s,
      end: domainEnd ?? e,
    };
  }

  const span = e - s;

  if (domainStart !== undefined && domainEnd !== undefined) {
    const maxSpan = domainEnd - domainStart;
    if (span >= maxSpan) return { start: domainStart, end: domainEnd };
    if (s < domainStart) { s = domainStart; e = s + span; }
    if (e > domainEnd) { e = domainEnd; s = e - span; }
    if (s < domainStart) s = domainStart;
  }

  return { start: s, end: e };
}

/**
 * y축 뷰 범위를 clamp합니다.
 * hardMin/hardMax를 넘기지 않으면 제한 없이 span만 보정합니다.
 */
export function clampYRange(
  min: number,
  max: number,
  hardMin?: number,
  hardMax?: number
): { min: number; max: number } {
  let lo = min;
  let hi = max;

  if (!(hi > lo)) return { min: lo - 10, max: hi + 10 };

  const span = hi - lo;

  if (hardMin !== undefined && lo < hardMin) { lo = hardMin; hi = lo + span; }
  if (hardMax !== undefined && hi > hardMax) { hi = hardMax; lo = hi - span; }
  if (hardMin !== undefined && lo < hardMin) lo = hardMin;

  return { min: lo, max: hi };
}

/**
 * 값 배열에서 y축 초기 범위를 계산합니다.
 * padding 비율과 hard limit은 선택적으로 넘길 수 있습니다.
 */
export function initialYRangeFromValues(
  values: number[],
  paddingRatio = 0.12,
  hardMin?: number,
  hardMax?: number
): { min: number; max: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) return { min: hardMin ?? 0, max: hardMax ?? 100 };
  if (lo === hi) { lo -= 2; hi += 2; }
  const pad = Math.max((hi - lo) * paddingRatio, 1);
  return clampYRange(lo - pad, hi + pad, hardMin, hardMax);
}

export function countVisiblePoints(
  timestamps: number[],
  minMs: number,
  maxMs: number
): number {
  let count = 0;
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i] >= minMs && timestamps[i] <= maxMs) count++;
  }
  return count;
}