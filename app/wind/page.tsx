"use client";

/**
 * app/wind/page.tsx
 *
 * /wind 페이지 — 런던 vs 한국 풍속 비교 차트
 */

import { WebGLLineChart } from "@/components/chart/WebGLLineChart";
import { WIND_CONFIG } from "@/config/charts/windConfig";

export default function WindPage() {
  return (
    <div className="w-full p-6">
      <h2 className="text-xl font-bold mb-1">풍속 비교</h2>
      <p className="text-sm text-gray-500 mb-6">
        런던과 한국의 2024년 시간별 풍속 데이터입니다. 휠로 줌, 드래그로 이동할 수 있습니다.
      </p>

      {/* 범례 */}
      <div className="flex gap-4 mb-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-0.5 bg-[#2563eb] rounded" />
          런던
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-0.5 bg-[#dc2626] rounded" />
          한국
        </span>
      </div>

      <WebGLLineChart config={WIND_CONFIG} />
    </div>
  );
}