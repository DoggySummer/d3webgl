import type { LineChartConfig } from "@/lib/chart/chartConfig";
import * as d3 from "d3";

// config/charts/humidityConfig.ts
export const HUMIDITY_CONFIG: LineChartConfig = {
  title: "실내 습도",
  lines: [
    {
      dataUrl: "/api/humidity",  // ← JSON 파일이 아닌 API 경로
      xKey: "timestamps",
      yKey: "humidity",
      label: "실내 습도",
      color: "#0891b2",
      formatY: (v) => `${v.toFixed(1)}%`,
    },
  ],
  xType: "time",
  yLabel: "%",
  yMin: 0,
  yMax: 100,
  formatTooltip: (x, y, label) =>
    `${d3.timeFormat("%Y-%m-%d %H:%M")(new Date(x))}  ${label}: ${y.toFixed(1)}%`,
  height: 540,
};