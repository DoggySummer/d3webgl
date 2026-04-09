"use server";

export type ApiResolution = "daily" | "hourly";
export type DisplayResolution = "daily" | "12h" | "6h" | "hourly";

export interface TemperatureResponse {
  timestamps: number[];
  temperatures: number[];
  apiResolution: ApiResolution;
  displayResolution: DisplayResolution;
  startDate: string;
  endDate: string;
}

// ---------------------------------------------------------------------------
// 인메모리 캐시 — 서버 프로세스 수명 동안 mock JSON을 한 번만 읽습니다.
// ---------------------------------------------------------------------------
let _cache: { timestamps: number[]; temperatures: number[] } | null = null;

async function loadMockData() {
  if (_cache) return _cache;

  // Next.js 서버 액션에서 public 폴더 접근 방법
  const { readFileSync } = await import("fs");
  const { join } = await import("path");
  const filePath = join(process.cwd(), "public", "mock-weather.json");
  const raw = readFileSync(filePath, "utf-8");
  _cache = JSON.parse(raw);
  return _cache!;
}

// ---------------------------------------------------------------------------
// 메인 — 원본 fetchTemperature 시그니처와 100% 동일
// ---------------------------------------------------------------------------
export async function fetchTemperature(
  startDate: string,
  endDate: string,
  displayResolution: DisplayResolution
): Promise<TemperatureResponse> {
  const { timestamps, temperatures } = await loadMockData();

  return {
    timestamps,
    temperatures,
    apiResolution: "hourly",
    displayResolution,
    startDate,
    endDate,
  };
}