// app/wind/page.tsx
"use client";

import { WebGLMultiLineChart } from "@/components/chart/WebGlMultiLineChart";
import { WIND_CONFIG } from "@/config/charts";

export default function WindPage() {
  return (
    <div className="w-full p-6">
      <h2 className="text-xl font-bold mb-6">풍속 비교</h2>
      <WebGLMultiLineChart config={WIND_CONFIG} />
    </div>
  );
}