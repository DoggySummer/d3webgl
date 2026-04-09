// app/page.tsx
'use client';

import { WebGLLineChart } from "@/components/chart/WebGLLineChart";
import { TEMPERATURE_CONFIG } from "@/config/charts/temperatureConfig";

export default function D3WebGLPage() {
  return (
    <div className="w-full p-6">
      <h2 className="text-xl font-bold mb-4">D3 WebGL</h2>
      <WebGLLineChart config={TEMPERATURE_CONFIG} />
    </div>
  );
}