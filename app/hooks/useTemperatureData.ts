// hooks/useTemperatureData.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  fetchTemperature,
  DisplayResolution,
  TemperatureResponse,
} from "@/actions/fetchTemperature";

function toDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const TEMP_CHART_DOMAIN_MS = {
  start: Date.UTC(2003, 0, 1),
  end: Date.UTC(2026, 1, 28, 23, 59, 59, 999),
} as const;

export interface ViewRange {
  start: number;
  end: number;
}

export function clampViewRangeMs(start: number, end: number): ViewRange {
  const ds = TEMP_CHART_DOMAIN_MS.start;
  const de = TEMP_CHART_DOMAIN_MS.end;
  let s = Math.round(start);
  let e = Math.round(end);
  if (!(e > s)) {
    return { start: ds, end: de };
  }
  const span = e - s;
  const maxSpan = de - ds;
  if (span >= maxSpan) {
    return { start: ds, end: de };
  }
  if (s < ds) {
    s = ds;
    e = s + span;
  }
  if (e > de) {
    e = de;
    s = e - span;
  }
  if (s < ds) s = ds;
  return { start: s, end: e };
}

export function useTemperatureData() {
  const [viewRange, setViewRange] = useState<ViewRange>(() =>
    clampViewRangeMs(TEMP_CHART_DOMAIN_MS.start, TEMP_CHART_DOMAIN_MS.end)
  );

  // mock-weather.json을 쓰는 동안에는 해상도/벤치마크/프리페치가 불필요합니다.
  // 뷰레인지는 차트 UI용으로만 유지하고, 데이터는 한 번만 로드합니다.
  const resolution: DisplayResolution = "hourly";
  const fetchStart = toDateStr(TEMP_CHART_DOMAIN_MS.start);
  const fetchEnd = toDateStr(TEMP_CHART_DOMAIN_MS.end);

  const query = useQuery<TemperatureResponse>({
    queryKey: ["temperature", "mock"],
    queryFn: () => fetchTemperature(fetchStart, fetchEnd, resolution),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
    retry: 2,
    retryDelay: 1000,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const updateViewRange = useCallback(
    (start: number, end: number, visiblePoints?: number) => {
      const { start: s, end: e } = clampViewRangeMs(start, end);

      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        setViewRange((prev) =>
          prev.start === s && prev.end === e ? prev : { start: s, end: e }
        );
        timerRef.current = null;
      }, 150);
    },
    []
  );

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    viewRange,
    resolution,
    updateViewRange,
  };
}