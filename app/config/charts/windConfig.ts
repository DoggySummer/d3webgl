/**
 * config/charts/windConfig.ts
 *
 * 런던 vs 한국 풍속 비교 차트 config입니다.
 * 멀티라인 예시 — lines 배열에 2개의 라인을 넣습니다.
 */

import type { LineChartConfig } from "@/lib/chart/chartConfig";
import * as d3 from "d3";

export const WIND_CONFIG: LineChartConfig = {
  title: "풍속 비교 — 런던 vs 한국 (2024)",

  lines: [
    {
      dataUrl: "/mock-wind.json",
      xKey: "timestamps",
      yKey: "london",
      label: "런던",
      color: "#2563eb",                              // 파란색
      formatY: (v) => `${v.toFixed(1)} m/s`,
    },
    {
      dataUrl: "/mock-wind.json",
      xKey: "timestamps",
      yKey: "korea",
      label: "한국",
      color: "#dc2626",                              // 빨간색
      formatY: (v) => `${v.toFixed(1)} m/s`,
    },
  ],

  xType: "time",
  yLabel: "m/s",
  yMin: 0,

  formatTooltip: (x, y, label) =>
    `${d3.timeFormat("%Y-%m-%d %H:%M")(new Date(x))}  ${label}: ${y.toFixed(1)} m/s`,

  height: 540,
};