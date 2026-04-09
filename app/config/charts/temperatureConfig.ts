// config/charts/temperatureConfig.ts
import type { LineChartConfig } from "@/lib/chart/chartConfig";
import * as d3 from "d3";

export const TEMPERATURE_CONFIG: LineChartConfig = {
  title: "온도",
  lines: [
    {
      dataUrl: "/mock-weather.json",
      xKey: "timestamps",       // ← 복수형
      yKey: "temperatures",     // ← 복수형
      label: "온도",
      color: "#2563eb",
      formatY: (v) => `${v.toFixed(1)}°C`,
    },
  ],
  xType: "time",
  yLabel: "°C",
  formatTooltip: (x, y, label) =>
    `${d3.timeFormat("%Y-%m-%d %H:%M")(new Date(x))}  ${label}: ${y.toFixed(1)}°C`,
  height: 540,
};