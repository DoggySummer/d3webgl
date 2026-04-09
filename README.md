# D3 WebGL Line Chart — 사용 가이드

이 프로젝트는 **대용량 시계열 데이터를 차트로 그리는 표본 프로젝트**입니다.  
새 차트를 추가할 때는 특정 파일만 수정하면 되고, 나머지는 건드리지 않아도 됩니다.

---

## 핵심 원칙

> **config 파일만 만들면 차트가 생긴다.**  
> 나머지 파일(WebGL, 셰이더, 훅 등)은 이해하지 않아도 됩니다.

---

## 파일 구조 — 건드려야 하는 곳 vs 건드리면 안 되는 곳

```
app/
├── page.tsx                         ✅ 건드려도 됨 — 싱글라인 페이지 (온도)
├── wind/
│   └── page.tsx                     ✅ 건드려도 됨 — 멀티라인 페이지 (풍속)
├── humidity/
│   └── page.tsx                     ✅ 건드려도 됨 — dynamic 싱글라인 페이지 (습도)
├── api/
│   └── humidity/
│       └── route.ts                 ✅ 건드려도 됨 — 구간 fetch API (mock 서버)
│
├── config/charts/
│   ├── index.ts                     ✅ 건드려도 됨 — 새 config export 추가
│   ├── temperatureConfig.ts         ✅ 건드려도 됨 — 싱글라인 예시, 복붙 시작점
│   ├── windConfig.ts                ✅ 건드려도 됨 — 멀티라인 예시, 복붙 시작점
│   └── humidityConfig.ts            ✅ 건드려도 됨 — dynamic 싱글라인 예시
│
├── components/chart/
│   ├── WebGLLineChart.tsx           🚫 건드리지 말 것
│   └── WebGlMultiLineChart.tsx      🚫 건드리지 말 것
│
├── hooks/
│   ├── useChartData.ts              🚫 건드리지 말 것
│   └── chart/
│       ├── useAxesLayer.ts          🚫 건드리지 말 것
│       ├── useCursorLayer.ts        🚫 건드리지 말 것
│       ├── useChartInteractions.ts  🚫 건드리지 말 것
│       └── useWebGLLineLayer.ts     🚫 건드리지 말 것
│
└── lib/chart/
    ├── types.ts                     🚫 건드리지 말 것
    ├── webgl.ts                     🚫 건드리지 말 것
    ├── math.ts                      🚫 건드리지 말 것
    ├── overlay2d.ts                 🚫 건드리지 말 것
    └── chartConfig.ts               ⚠️  타입 정의만 있음. 읽기는 해도 수정은 팀 논의 후
```

**결론: 새 차트를 추가할 때 만지는 파일은 최대 3개입니다.**
1. `config/charts/` 안에 새 config 파일 생성
2. `config/charts/index.ts` 에 export 한 줄 추가
3. `app/` 안에 새 페이지 파일 생성

---

## 차트 종류 3가지

| 종류 | 컴포넌트 | 특징 | 예시 |
|------|---------|------|------|
| 싱글라인 (static) | `WebGLLineChart` | JSON 파일 1회 fetch | 온도 |
| 멀티라인 (static) | `WebGLMultiLineChart` | JSON 파일 1회 fetch, 라인 토글 | 풍속 비교 |
| 싱글라인 (dynamic) | `WebGLLineChart dynamic` | 줌/팬 시 API 재호출 | 습도 |

---

## 싱글라인 차트 (static)

JSON 파일을 한 번만 fetch합니다. 데이터가 수십만 점 이하이고 API가 없을 때 사용합니다.

### Step 1 — config 파일 만들기

```typescript
// config/charts/myChart.ts
"use client";

import type { LineChartConfig } from "@/lib/chart/chartConfig";
import * as d3 from "d3";

export const MY_CHART_CONFIG: LineChartConfig = {
  title: "차트 제목",

  lines: [
    {
      dataUrl: "/my-data.json",  // public/ 폴더 기준 경로
      xKey: "timestamps",        // JSON에서 x축(시간)으로 쓸 키 이름
      yKey: "values",            // JSON에서 y축(값)으로 쓸 키 이름
      label: "내 데이터",
      color: "#2563eb",
      formatY: (v) => `${v.toFixed(1)}`,
    },
  ],

  xType: "time",
  yLabel: "단위",
  // yMin: 0,   ← y축 하한 고정. 없으면 자동
  // yMax: 100, ← y축 상한 고정. 없으면 자동

  formatTooltip: (x, y, label) =>
    `${d3.timeFormat("%Y-%m-%d %H:%M")(new Date(x))}  ${label}: ${y.toFixed(1)}`,

  height: 540,
};
```

### Step 2 — index.ts에 export 추가

```typescript
// config/charts/index.ts
export { MY_CHART_CONFIG } from "./myChart";
```

### Step 3 — 페이지 만들기

```tsx
// app/my-chart/page.tsx
"use client";

import { WebGLLineChart } from "@/components/chart/WebGLLineChart";
import { MY_CHART_CONFIG } from "@/config/charts";

export default function Page() {
  return (
    <main className="p-6">
      <WebGLLineChart config={MY_CHART_CONFIG} />
    </main>
  );
}
```

> **주의**: 페이지 파일에 반드시 `"use client"`를 추가해야 합니다.  
> config에 함수(`formatY`, `formatTooltip`)가 포함되어 있어서 Server Component에서 넘기면 에러가 납니다.

---

## 멀티라인 차트 (static)

라인이 2개 이상일 때 사용합니다. **y축 단위가 같은 데이터**를 비교할 때 적합합니다.  
차트 오른쪽에 범례가 자동으로 생기고 클릭하면 라인을 켜고 끌 수 있습니다.

### Step 1 — config 파일 만들기

싱글라인과 차이점은 `lines` 배열에 항목을 여러 개 넣는 것뿐입니다.

```typescript
// config/charts/myMultiChart.ts
"use client";

import type { LineChartConfig } from "@/lib/chart/chartConfig";
import * as d3 from "d3";

export const MY_MULTI_CHART_CONFIG: LineChartConfig = {
  title: "A vs B 비교",

  lines: [
    {
      dataUrl: "/my-data.json",
      xKey: "timestamps",
      yKey: "series_a",
      label: "A",
      color: "#2563eb",
      formatY: (v) => `${v.toFixed(1)}`,
    },
    {
      dataUrl: "/my-data.json",  // 같은 파일, 다른 yKey
      xKey: "timestamps",
      yKey: "series_b",
      label: "B",
      color: "#dc2626",
      formatY: (v) => `${v.toFixed(1)}`,
    },
  ],

  xType: "time",
  yLabel: "단위",
  yMin: 0,

  formatTooltip: (x, y, label) =>
    `${d3.timeFormat("%Y-%m-%d %H:%M")(new Date(x))}  ${label}: ${y.toFixed(1)}`,

  height: 540,
};
```

### Step 2, 3 — export 추가 + 페이지

```typescript
// config/charts/index.ts
export { MY_MULTI_CHART_CONFIG } from "./myMultiChart";
```

```tsx
// app/my-multi-chart/page.tsx
"use client";

import { WebGLMultiLineChart } from "@/components/chart/WebGlMultiLineChart";
import { MY_MULTI_CHART_CONFIG } from "@/config/charts";

export default function Page() {
  return (
    <main className="p-6">
      <WebGLMultiLineChart config={MY_MULTI_CHART_CONFIG} />
    </main>
  );
}
```

---

## 싱글라인 차트 (dynamic)

줌/팬/구간 변경 시 API를 재호출합니다.  
데이터가 매우 많거나 실시간으로 구간별 데이터를 받아야 할 때 사용합니다.

### static과의 차이점

| | static | dynamic |
|--|--------|---------|
| 데이터 소스 | `public/` JSON 파일 | API 엔드포인트 |
| fetch 시점 | 마운트 시 1회 | 줌/팬으로 구간 변경 시마다 |
| `dataUrl` | `/my-data.json` | `/api/my-endpoint` |
| 페이지 컴포넌트 | `<WebGLLineChart config={...} />` | `<WebGLLineChart config={...} dynamic />` |

### Step 1 — API route 만들기

```typescript
// app/api/my-data/route.ts
import { NextRequest, NextResponse } from "next/server";

// 전체 데이터를 메모리에 올려두고 구간 필터링만 수행
// 실제 서버로 교체할 때는 이 함수 내부만 DB 쿼리로 바꾸면 됨
const ALL_DATA = generateData(); // 데이터 생성 또는 import

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const startParam = searchParams.get("start");
  const endParam   = searchParams.get("end");

  // 파라미터가 없거나 0이면 전체 범위 반환
  const start = startParam && startParam !== "0" ? Number(startParam) : DATA_START_MS;
  const end   = endParam   && endParam   !== "0" ? Number(endParam)   : DATA_END_MS;

  if (isNaN(start) || isNaN(end) || start >= end) {
    return NextResponse.json({ error: "잘못된 파라미터" }, { status: 400 });
  }

  const filtered = ALL_DATA.filter((p) => p.ts >= start && p.ts <= end);

  return NextResponse.json({
    timestamps: filtered.map((p) => p.ts),
    values:     filtered.map((p) => p.value),
  });
}
```

### Step 2 — config 파일 만들기

static과 동일하되 `dataUrl`을 API 경로로 지정합니다.

```typescript
// config/charts/myDynamicChart.ts
"use client";

import type { LineChartConfig } from "@/lib/chart/chartConfig";
import * as d3 from "d3";

export const MY_DYNAMIC_CONFIG: LineChartConfig = {
  title: "내 동적 차트",
  lines: [
    {
      dataUrl: "/api/my-data",   // ← JSON 파일이 아닌 API 경로
      xKey: "timestamps",
      yKey: "values",
      label: "데이터",
      color: "#0891b2",
      formatY: (v) => `${v.toFixed(1)}`,
    },
  ],
  xType: "time",
  yLabel: "단위",
  formatTooltip: (x, y, label) =>
    `${d3.timeFormat("%Y-%m-%d %H:%M")(new Date(x))}  ${label}: ${y.toFixed(1)}`,
  height: 540,
};
```

### Step 3 — 페이지 만들기

`dynamic` prop 하나만 추가합니다.

```tsx
// app/my-dynamic-chart/page.tsx
"use client";

import { WebGLLineChart } from "@/components/chart/WebGLLineChart";
import { MY_DYNAMIC_CONFIG } from "@/config/charts";

export default function Page() {
  return (
    <main className="p-6">
      <WebGLLineChart config={MY_DYNAMIC_CONFIG} dynamic />
    </main>
  );
}
```

### dynamic 모드 re-fetch 조건

뷰가 이미 fetch된 구간 끝에서 **10% 이내**로 접근하면 자동으로 re-fetch합니다.  
re-fetch 시에는 현재 뷰 앞뒤로 **50% 여유**를 포함한 구간을 요청합니다.  
이 값은 `hooks/useChartData.ts` 상단의 상수로 관리합니다.

```typescript
const REFETCH_THRESHOLD = 0.1; // 10% 이내 접근 시 re-fetch
const FETCH_PADDING     = 0.5; // 뷰 스팬의 50% 앞뒤 여유
```

### API 요청 로그 확인 (개발용)

`page.tsx`에 fetch 인터셉터를 추가하면 언제 어떤 구간을 요청했는지 화면에서 확인할 수 있습니다.  
습도 차트(`app/humidity/page.tsx`)에 구현되어 있으니 참고하세요.

---

## 데이터 파일 형식

`public/` 폴더에 JSON 파일을 넣습니다. (static 모드 전용)

### 권장 형식 — 컬럼 배열

```json
{
  "timestamps": [1704067200000, 1704070800000, 1704074400000],
  "values":     [3.2, 3.8, 4.1]
}
```

멀티라인에서 하나의 파일로 여러 라인을 표현:

```json
{
  "timestamps": [1704067200000, 1704070800000, 1704074400000],
  "series_a":   [3.2, 3.8, 4.1],
  "series_b":   [1.1, 1.4, 1.2]
}
```

### 주의사항

| 항목 | 설명 |
|------|------|
| timestamp 단위 | **밀리초(ms)** 여야 합니다. `new Date().getTime()` 기준 |
| timestamp 정렬 | **오름차순**이어야 합니다. 순서가 뒤섞이면 커서가 오작동합니다 |
| 결측값 | `null` 대신 `NaN`이나 `-9999`를 씁니다 |

---

## config 옵션 한눈에 보기

```typescript
{
  title?: string            // 차트 제목. 생략 가능

  lines: [                  // 라인 목록 (1개 = 싱글, 2개 이상 = 멀티)
    {
      dataUrl: string       // 데이터 경로 ← 반드시 수정
                            //   static:  "/my-data.json"
                            //   dynamic: "/api/my-endpoint"
      xKey: string          // x축 키 이름 ← 반드시 수정
      yKey: string          // y축 키 이름 ← 반드시 수정
      label: string         // 툴팁/범례 이름 ← 반드시 수정
      color: string         // 선 색상 hex
      formatY: (v) => string  // y값 포맷
    }
  ]

  xType: "time"             // 시계열이면 항상 "time". 건드리지 않아도 됨
  yLabel: string            // y축 단위 텍스트

  yMin?: number             // y축 하한 고정. 없으면 자동
  yMax?: number             // y축 상한 고정. 없으면 자동

  formatTooltip: (x, y, label) => string  // 툴팁 텍스트 형식

  height?: number           // 차트 높이(px). 기본 540
}
```

### yMin / yMax 가이드

| 상황 | 권장 |
|------|------|
| 풍속, 강수량, 습도 등 0 이하가 없는 데이터 | `yMin: 0` 고정 |
| 기온 등 음수가 있는 데이터 | 생략 (자동 계산) |
| 센서 범위가 명확한 데이터 | `yMin`, `yMax` 모두 고정 |

---

## 자주 하는 실수

**차트가 아무것도 안 보일 때**
- `dataUrl` 경로가 `public/` 기준인지 확인. `/my-data.json` → `public/my-data.json` 파일이 있어야 합니다
- JSON의 키 이름과 `xKey`, `yKey`가 정확히 일치하는지 확인 (대소문자 포함)
- timestamp가 ms 단위인지 확인. 초 단위면 1000을 곱해야 합니다

**"Functions cannot be passed directly to Client Components" 에러**
- 페이지 파일 맨 위에 `"use client"`를 추가합니다
- config에 함수(`formatY`, `formatTooltip`)가 포함되어 있어서 Server Component에서 넘기면 발생합니다

**특정 구간 이상 팬/줌 하면 차트가 빈 화면이 될 때**
- `useChartInteractions.ts`의 `clampViewRangeMs` 호출에 `domainStart`, `domainEnd`가 전달되고 있는지 확인합니다
- `math.ts`가 아니라 `useChartInteractions.ts`를 수정해야 합니다

**dynamic 차트가 초기에 아무것도 안 보일 때**
- `useChartData.ts`의 초기 `fetchRange`가 `{ start: 0, end: 0 }`으로 설정되어 있는지 확인합니다
- `route.ts`에서 `start=0, end=0`을 전체 범위로 처리하고 있는지 확인합니다

**툴팁 날짜 형식을 바꾸고 싶을 때**
- `formatTooltip` 안의 `d3.timeFormat(...)` 포맷 문자열만 수정합니다
- `%Y` 연도, `%m` 월, `%d` 일, `%H` 시, `%M` 분

**y축 범위가 이상할 때**
- 값이 항상 양수면 `yMin: 0`을 추가합니다
- 범위를 고정하고 싶으면 `yMin`, `yMax`를 직접 지정합니다
- y축 범위는 `lib/chart/math.ts`의 `clampYRange`가 계산하지만 직접 건드리지 않아도 됩니다