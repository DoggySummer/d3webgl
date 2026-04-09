// app/api/humidity/route.ts

import { NextRequest, NextResponse } from "next/server";

// ── 전체 데이터 1회 생성 (서버 시작 시 메모리에 상주) ─────────────────
// 6개월 × 30분 간격 = 8,760개 포인트

const INTERVAL_MS = 30 * 60 * 1000;

const START_MS = new Date("2024-01-01T00:00:00Z").getTime();
const END_MS = new Date("2024-07-01T00:00:00Z").getTime();

interface HumidityPoint {
  ts: number;
  humidity: number;
}

function generateHumidityData(): HumidityPoint[] {
  const data: HumidityPoint[] = [];

  let trend = 0;

  for (let ts = START_MS; ts <= END_MS; ts += INTERVAL_MS) {
    const date = new Date(ts);
    const dayOfYear = Math.floor((ts - START_MS) / (24 * 60 * 60 * 1000));
    const hourOfDay = date.getUTCHours() + date.getUTCMinutes() / 60;

    // 계절 변동: 1월 낮고 봄(4~5월) 높음
    const seasonal = 10 * Math.sin((dayOfYear / 182) * Math.PI);

    // 일중 변동: 새벽 4시 최고, 오후 2시 최저
    const diurnal = -8 * Math.cos(((hourOfDay - 4) / 24) * 2 * Math.PI);

    // 장기 트렌드 (완만한 랜덤 워크)
    trend += (Math.random() - 0.5) * 0.3;
    trend = Math.max(-10, Math.min(10, trend));

    // 단기 노이즈
    const noise = (Math.random() - 0.5) * 4;

    const base = 55;
    const humidity = base + seasonal + diurnal + trend + noise;

    data.push({
      ts,
      humidity: Math.round(Math.max(20, Math.min(95, humidity)) * 10) / 10,
    });
  }

  return data;
}

// 모듈 로드 시 1회만 실행
const ALL_DATA: HumidityPoint[] = generateHumidityData();

// ── GET /api/humidity?start=...&end=... ───────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  // 파라미터가 없거나 0이면 전체 범위 반환
  const start = startParam && startParam !== "0" ? Number(startParam) : START_MS;
  const end = endParam && endParam !== "0" ? Number(endParam) : END_MS;

  // 유효성 검사
  if (isNaN(start) || isNaN(end) || start >= end) {
    return NextResponse.json(
      { error: "start, end 파라미터가 올바르지 않습니다." },
      { status: 400 }
    );
  }

  // 구간 필터링
  const filtered = ALL_DATA.filter((p) => p.ts >= start && p.ts <= end);

  return NextResponse.json(
    {
      timestamps: filtered.map((p) => p.ts),
      humidity: filtered.map((p) => p.humidity),
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}