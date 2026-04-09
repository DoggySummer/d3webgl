/**
 * hooks/useChartData.ts
 *
 * config의 lines 배열을 받아서 데이터를 fetch하는 범용 훅입니다.
 * 같은 dataUrl을 가진 lines는 한 번만 fetch해서 공유합니다.
 */

"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LineSeries } from "@/lib/chart/chartConfig";

export interface ChartSeriesData {
  timestamps: number[];
  values: number[];
  label: string;
  color: string;
}

interface UseChartDataParams {
  lines: LineSeries[];
}

interface ViewRange {
  start: number;
  end: number;
}

/**
 * 하나의 dataUrl에서 데이터를 fetch해서 여러 yKey를 파싱합니다.
 * 같은 dataUrl을 여러 lines가 공유해도 fetch는 1번만 합니다.
 */
function useRawData(dataUrl: string) {
  return useQuery<Record<string, number[]>>({
    queryKey: ["chartRawData", dataUrl],
    queryFn: async () => {
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error(`Failed to fetch: ${dataUrl}`);
      const json = await res.json();

      // 형식 A: { timestamps: [...], london: [...], korea: [...] }
      if (!Array.isArray(json)) {
        return json as Record<string, number[]>;
      }

      // 형식 B: [{ timestamp: ..., value: ... }, ...]
      // 첫 번째 객체의 키를 기준으로 변환
      const keys = Object.keys(json[0]);
      const result: Record<string, number[]> = {};
      for (const key of keys) {
        result[key] = json.map((d: Record<string, number>) => Number(d[key]));
      }
      return result;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useChartData({ lines }: UseChartDataParams) {
  const [viewRange, setViewRange] = useState<ViewRange>({ start: 0, end: 0 });

  // 같은 dataUrl끼리 묶기 (중복 fetch 방지)
  // 현재는 단순하게 lines[0].dataUrl 기준으로 fetch
  // 여러 dataUrl이 필요한 경우 확장 가능
  const primaryDataUrl = lines[0].dataUrl;
  const { data: rawData, isLoading, error } = useRawData(primaryDataUrl);

  // 각 라인별로 { timestamps, values, label, color } 조립
  const seriesData: ChartSeriesData[] | null = rawData
    ? lines.map((line) => ({
      timestamps: (rawData[line.xKey] ?? []).map(Number),
      values: (rawData[line.yKey] ?? []).map(Number),
      label: line.label,
      color: line.color,
    }))
    : null;

  // viewRange 초기화 (첫 번째 라인의 timestamps 기준)
  const firstTs = seriesData?.[0]?.timestamps;
  const initialViewRange =
    firstTs && firstTs.length > 0
      ? { start: firstTs[0], end: firstTs[firstTs.length - 1] }
      : viewRange;

  const updateViewRange = useCallback((start: number, end: number) => {
    setViewRange((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end }
    );
  }, []);

  return {
    seriesData,
    // 하위 호환: 단일 라인 차트에서 data.timestamps / data.values 쓸 수 있게
    data: seriesData
      ? { timestamps: seriesData[0].timestamps, values: seriesData[0].values }
      : null,
    isLoading,
    error,
    viewRange: viewRange.start === 0 ? initialViewRange : viewRange,
    updateViewRange,
  };
}