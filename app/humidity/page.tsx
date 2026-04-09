"use client";

import { useState, useEffect, useRef } from "react";
import { WebGLLineChart } from "@/components/chart/WebGLLineChart";
import { HUMIDITY_CONFIG } from "@/config/charts";

interface FetchLog {
  id: number;
  time: string;
  start: string;
  end: string;
  duration: number;
  count: number;
}

// fetch를 가로채서 로그를 남기는 전역 인터셉터
// humidity API 요청만 캡처
function createFetchInterceptor(onLog: (log: FetchLog) => void) {
  const original = window.fetch;
  let idCounter = 0;

  window.fetch = async (...args) => {
    const url = typeof args[0] === "string" ? args[0] : args[0].toString();

    if (!url.includes("/api/humidity")) {
      return original(...args);
    }

    const parsed = new URL(url, window.location.origin);
    const startMs = parsed.searchParams.get("start");
    const endMs = parsed.searchParams.get("end");

    const fmt = (ms: string | null) => {
      if (!ms || ms === "0") return "전체";
      return new Date(Number(ms)).toISOString().slice(0, 16).replace("T", " ");
    };

    const t0 = performance.now();
    const res = await original(...args);
    const duration = Math.round(performance.now() - t0);

    // 응답 복제 후 포인트 수 파악
    const clone = res.clone();
    clone.json().then((data) => {
      const count = data?.timestamps?.length ?? 0;
      onLog({
        id: ++idCounter,
        time: new Date().toTimeString().slice(0, 8),
        start: fmt(startMs),
        end: fmt(endMs),
        duration,
        count,
      });
    });

    return res;
  };

  return () => { window.fetch = original; };
}

export default function Page() {
  const [logs, setLogs] = useState<FetchLog[]>([]);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const restore = createFetchInterceptor((log) => {
      setLogs((prev) => [log, ...prev].slice(0, 20)); // 최근 20개만 유지
    });

    return restore;
  }, []);

  return (
    <main className="p-6 space-y-4">
      <WebGLLineChart config={HUMIDITY_CONFIG} dynamic />

      {/* fetch 로그 패널 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden text-xs font-mono">
        <div className="bg-gray-100 px-3 py-2 text-gray-600 font-sans text-xs font-medium">
          GET /api/humidity 요청 로그 (최근 20개)
        </div>

        {logs.length === 0 ? (
          <div className="px-3 py-3 text-gray-400">아직 요청 없음</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="px-3 py-1.5 text-left font-normal">#</th>
                <th className="px-3 py-1.5 text-left font-normal">시각</th>
                <th className="px-3 py-1.5 text-left font-normal">start</th>
                <th className="px-3 py-1.5 text-left font-normal">end</th>
                <th className="px-3 py-1.5 text-right font-normal">포인트</th>
                <th className="px-3 py-1.5 text-right font-normal">응답시간</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr
                  key={log.id}
                  className={i === 0 ? "bg-blue-50" : "bg-white"}
                >
                  <td className="px-3 py-1.5 text-gray-400">{log.id}</td>
                  <td className="px-3 py-1.5 text-gray-500">{log.time}</td>
                  <td className="px-3 py-1.5 text-gray-700">{log.start}</td>
                  <td className="px-3 py-1.5 text-gray-700">{log.end}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{log.count.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right text-gray-500">{log.duration}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}