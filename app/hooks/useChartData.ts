"use client";

/**
 * hooks/useChartData.ts
 *
 * config의 lines 배열을 받아서 데이터를 fetch하는 범용 훅입니다.
 *
 * dynamic: false (기본값) → static 모드. 기존 JSON 파일 1회 fetch.
 * dynamic: true           → dynamic 모드. 줌/팬 시 start/end 파라미터로 API 재호출.
 */

import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LineSeries } from "@/lib/chart/chartConfig";

export interface ChartSeriesData {
  timestamps: number[];
  values: number[];
  label: string;
  color: string;
}

interface ViewRange {
  start: number;
  end: number;
}

interface UseChartDataParams {
  lines: LineSeries[];
  dynamic?: boolean;
}

// ── re-fetch 트리거 상수 ──────────────────────────────────────────────
// 뷰가 fetch 구간 끝에서 이 비율 이내로 접근하면 re-fetch
const REFETCH_THRESHOLD = 0.1;
// fetch 시 뷰 앞뒤로 추가할 여유 비율
const FETCH_PADDING = 0.5;

// ── Static fetch (기존 방식, JSON 파일 1회) ───────────────────────────

function useStaticData(dataUrl: string) {
  return useQuery<Record<string, number[]>>({
    queryKey: ["chartRawData", dataUrl],
    queryFn: async () => {
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error(`Failed to fetch: ${dataUrl}`);
      const json = await res.json();

      // 형식 A: { timestamps: [...], values: [...] }
      if (!Array.isArray(json)) return json as Record<string, number[]>;

      // 형식 B: [{ timestamp: ..., value: ... }, ...]
      const keys = Object.keys(json[0]);
      const result: Record<string, number[]> = {};
      for (const key of keys) {
        result[key] = json.map((d: Record<string, number>) => Number(d[key]));
      }
      return result;
    },
    enabled: dataUrl !== "",
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// ── Dynamic fetch (API + 구간 파라미터) ──────────────────────────────

function useDynamicData(dataUrl: string, fetchRange: ViewRange | null) {
  return useQuery<Record<string, number[]>>({
    // fetchRange가 queryKey에 포함 → 범위 바뀌면 자동 re-fetch
    queryKey: ["chartDynamicData", dataUrl, fetchRange?.start, fetchRange?.end],
    queryFn: async () => {
      if (!fetchRange) return {};

      const url = new URL(dataUrl, window.location.origin);

      // start/end 둘 다 0이면 파라미터 생략 → 서버가 전체 범위 반환
      if (fetchRange.start !== 0 || fetchRange.end !== 0) {
        url.searchParams.set("start", String(fetchRange.start));
        url.searchParams.set("end", String(fetchRange.end));
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Failed to fetch: ${url}`);
      return res.json() as Promise<Record<string, number[]>>;
    },
    enabled: dataUrl !== "" && fetchRange !== null,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

// ── 메인 훅 ──────────────────────────────────────────────────────────

export function useChartData({ lines, dynamic = false }: UseChartDataParams) {
  const [viewRange, setViewRange] = useState<ViewRange>({ start: 0, end: 0 });

  // dynamic 모드: 현재 fetch된 구간 추적
  const fetchRangeRef = useRef<ViewRange | null>(null);

  // dynamic 모드: { start: 0, end: 0 } → 파라미터 없이 전체 범위 요청
  const [fetchRange, setFetchRange] = useState<ViewRange | null>(
    dynamic ? { start: 0, end: 0 } : null
  );

  const primaryDataUrl = lines[0].dataUrl;

  // static / dynamic 분기 (조건부 훅 호출 금지로 양쪽 다 호출, enabled로 제어)
  const staticResult = useStaticData(dynamic ? "" : primaryDataUrl);
  const dynamicResult = useDynamicData(dynamic ? primaryDataUrl : "", fetchRange);

  const rawData = dynamic ? dynamicResult.data : staticResult.data;
  const isLoading = dynamic ? dynamicResult.isLoading : staticResult.isLoading;
  const error = dynamic ? dynamicResult.error : staticResult.error;

  // 각 라인별 seriesData 조립
  const seriesData: ChartSeriesData[] | null =
    rawData && Object.keys(rawData).length > 0
      ? lines.map((line) => ({
        timestamps: (rawData[line.xKey] ?? []).map(Number),
        values: (rawData[line.yKey] ?? []).map(Number),
        label: line.label,
        color: line.color,
      }))
      : null;

  const firstTs = seriesData?.[0]?.timestamps;
  const initialViewRange =
    firstTs && firstTs.length > 0
      ? { start: firstTs[0], end: firstTs[firstTs.length - 1] }
      : viewRange;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateViewRange = useCallback(
    (start: number, end: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // viewRange 업데이트 (static/dynamic 공통)
        setViewRange((prev) =>
          prev.start === start && prev.end === end ? prev : { start, end }
        );

        // dynamic 모드: re-fetch 필요 여부 판단
        if (dynamic) {
          const fetched = fetchRangeRef.current;
          const viewSpan = end - start;

          let shouldRefetch = false;

          if (!fetched || (fetched.start === 0 && fetched.end === 0)) {
            // 최초 실제 뷰 범위 확정 시점 → 뷰 ±padding으로 첫 구간 fetch
            shouldRefetch = true;
          } else {
            // 뷰가 fetch 구간 끝에서 THRESHOLD 이내로 접근하면 re-fetch
            const leftMargin = start - fetched.start;
            const rightMargin = fetched.end - end;
            const threshold = viewSpan * REFETCH_THRESHOLD;

            shouldRefetch = leftMargin < threshold || rightMargin < threshold;
          }

          if (shouldRefetch) {
            const padding = viewSpan * FETCH_PADDING;
            const nextRange: ViewRange = {
              start: Math.floor(start - padding),
              end: Math.ceil(end + padding),
            };
            fetchRangeRef.current = nextRange;
            setFetchRange(nextRange);
          }
        }

        timerRef.current = null;
      }, 150);
    },
    [dynamic]
  );

  return {
    seriesData,
    data: seriesData
      ? { timestamps: seriesData[0].timestamps, values: seriesData[0].values }
      : null,
    isLoading,
    error,
    viewRange: viewRange.start === 0 ? initialViewRange : viewRange,
    updateViewRange,
  };
}