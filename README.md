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
├── page.tsx                     ✅ 건드려도 됨 — 싱글라인 페이지
├── wind/
│   └── page.tsx                 ✅ 건드려도 됨 — 멀티라인 페이지
│
├── config/charts/
│   ├── index.ts                 ✅ 건드려도 됨 — 새 config export 추가
│   ├── temperatureConfig.ts     ✅ 건드려도 됨 — 싱글라인 예시, 복붙 시작점
│   └── windConfig.ts            ✅ 건드려도 됨 — 멀티라인 예시, 복붙 시작점
│
├── components/chart/
│   ├── WebGLLineChart.tsx       🚫 건드리지 말 것
│   └── WebGlMultiLineChart.tsx  🚫 건드리지 말 것
│
├── hooks/
│   ├── useChartData.ts          🚫 건드리지 말 것
│   └── chart/
│       ├── useAxesLayer.ts      🚫 건드리지 말 것
│       ├── useCursorLayer.ts    🚫 건드리지 말 것
│       ├── useChartInteractions.ts  🚫 건드리지 말 것
│       └── useWebGLLineLayer.ts     🚫 건드리지 말 것
│
└── lib/chart/
    ├── types.ts                 🚫 건드리지 말 것
    ├── webgl.ts                 🚫 건드리지 말 것
    ├── math.ts                  🚫 건드리지 말 것
    ├── overlay2d.ts             🚫 건드리지 말 것
    └── chartConfig.ts           ⚠️  타입 정의만 있음. 읽기는 해도 수정은 팀 논의 후
```

**결론: 새 차트를 추가할 때 만지는 파일은 최대 3개입니다.**
1. `config/charts/` 안에 새 config 파일 생성
2. `config/charts/index.ts` 에 export 한 줄 추가
3. `app/` 안에 새 페이지 파일 생성

---

## 싱글라인 차트 추가하기

라인이 1개인 차트입니다. `temperatureConfig.ts`를 복붙해서 수정합니다.

### Step 1 — config 파일 만들기

```typescript
// config/charts/myChart.ts
import type { LineChartConfig } from "@/lib/chart/chartConfig";
import * as d3 from "d3";

export const MY_CHART_CONFIG: LineChartConfig = {
  title: "차트 제목",          // 차트 위에 표시되는 제목. 없애려면 이 줄 삭제

  lines: [
    {
      dataUrl: "/my-data.json", // public/ 폴더 기준 경로
      xKey: "timestamps",       // JSON에서 x축(시간)으로 쓸 키 이름
      yKey: "values",           // JSON에서 y축(값)으로 쓸 키 이름
      label: "내 데이터",       // 툴팁에 표시될 라인 이름
      color: "#2563eb",         // 선 색상 (hex)
      formatY: (v) => `${v.toFixed(1)}`,  // y값 표시 형식
    },
  ],

  xType: "time",               // 시간 데이터면 항상 "time"으로 고정
  yLabel: "단위",               // y축 레이블. 예: "°C", "m/s", "hPa"

  // y축 범위를 고정하고 싶을 때만 씁니다. 없으면 자동 계산
  // yMin: 0,
  // yMax: 100,

  formatTooltip: (x, y, label) =>
    `${d3.timeFormat("%Y-%m-%d %H:%M")(new Date(x))}  ${label}: ${y.toFixed(1)}`,

  height: 540,                 // 차트 높이(px). 바꾸고 싶으면 수정
};
```

### Step 2 — index.ts에 export 추가

```typescript
// config/charts/index.ts 에 한 줄 추가
export { MY_CHART_CONFIG } from "./myChart";
```

### Step 3 — 페이지 만들기

```tsx
// app/my-chart/page.tsx
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

`/my-chart` 로 접속하면 차트가 표시됩니다.

---

## 멀티라인 차트 추가하기

라인이 2개 이상인 차트입니다. `windConfig.ts`를 복붙해서 수정합니다.  
**y축 단위가 같은 데이터를 비교할 때** 사용합니다.

### Step 1 — config 파일 만들기

싱글라인과 차이점은 `lines` 배열에 항목을 여러 개 넣는 것뿐입니다.

```typescript
// config/charts/myMultiChart.ts
import type { LineChartConfig } from "@/lib/chart/chartConfig";
import * as d3 from "d3";

export const MY_MULTI_CHART_CONFIG: LineChartConfig = {
  title: "A vs B 비교",

  lines: [
    {
      dataUrl: "/my-data.json", // 두 라인이 같은 파일을 쓸 수 있습니다
      xKey: "timestamps",
      yKey: "series_a",         // 파일 안에서 각각 다른 키를 지정
      label: "A",
      color: "#2563eb",         // 라인마다 다른 색상
      formatY: (v) => `${v.toFixed(1)}`,
    },
    {
      dataUrl: "/my-data.json", // 같은 파일, 다른 yKey
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

### Step 2 — index.ts에 export 추가

```typescript
export { MY_MULTI_CHART_CONFIG } from "./myMultiChart";
```

### Step 3 — 페이지 만들기

컴포넌트 이름만 다릅니다. `WebGLMultiLineChart`를 사용합니다.

```tsx
// app/my-multi-chart/page.tsx
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

차트 오른쪽에 자동으로 범례가 생기고, 클릭하면 라인을 켜고 끌 수 있습니다.

---

## 데이터 파일 형식

`public/` 폴더에 JSON 파일을 넣습니다.

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
| 결측값 | `null` 대신 숫자 배열을 유지하되, 비정상값은 `NaN`이나 `-9999`를 씁니다 |

---

## config 옵션 한눈에 보기

```typescript
{
  title?: string            // 차트 제목. 생략 가능

  lines: [                  // 라인 목록 (1개 = 싱글, 2개 이상 = 멀티)
    {
      dataUrl: string       // 데이터 파일 경로 ← 반드시 수정
      xKey: string          // x축 키 이름     ← 반드시 수정
      yKey: string          // y축 키 이름     ← 반드시 수정
      label: string         // 툴팁/범례 이름  ← 반드시 수정
      color: string         // 선 색상 hex     ← 취향껏 수정
      formatY: (v) => string  // y값 포맷      ← 단위에 맞게 수정
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

---

## 자주 하는 실수

**차트가 아무것도 안 보일 때**
- `dataUrl` 경로가 `public/` 기준인지 확인. `/my-data.json` → `public/my-data.json` 파일이 있어야 합니다
- JSON의 키 이름과 `xKey`, `yKey`가 정확히 일치하는지 확인 (대소문자 포함)
- timestamp가 ms 단위인지 확인. 초 단위면 1000을 곱해야 합니다

**라인 색이 다 똑같을 때**
- 멀티라인에서 각 라인마다 다른 `color` 값을 지정했는지 확인

**툴팁 날짜 형식을 바꾸고 싶을 때**
- `formatTooltip` 안의 `d3.timeFormat(...)` 포맷 문자열만 수정합니다
- `%Y` 연도, `%m` 월, `%d` 일, `%H` 시, `%M` 분

**y축 범위가 이상할 때**
- 값이 항상 양수면 `yMin: 0`을 추가합니다
- 범위를 고정하고 싶으면 `yMin`, `yMax`를 직접 지정합니다