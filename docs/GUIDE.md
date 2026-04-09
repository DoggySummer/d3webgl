# D3 + WebGL 차트 프로젝트 읽기 가이드

> 처음 보는 WebGL 차트 코드베이스를 주니어 개발자가 순서대로 파악하기 위한 가이드입니다.

---

## 용어 먼저 잡기

코드 읽기 전에 낯선 용어들을 정리하고 시작하세요. 기존 웹 프론트엔드 개념과 비교해서 이해하면 훨씬 쉽습니다.

| 용어 | 한줄 요약 | 비슷한 웹 개념 |
|------|-----------|---------------|
| **WebGL** | GPU를 쓰는 Canvas API | `canvas.getContext('2d')`의 고성능 버전 |
| **셰이더** | GPU에서 실행되는 미니 함수 | `array.map()`의 콜백 |
| **uniform** | 모든 점에 동일한 변수 | React props |
| **attribute** | 점마다 다른 변수 | 배열의 각 원소 |
| **버퍼** | GPU 메모리의 데이터 저장소 | GPU용 배열 |
| **NDC** | WebGL 내부 좌표계 (-1 ~ +1) | % 단위 같은 상대 좌표 |
| **Vertex Shader** | 좌표 계산 담당 셰이더 | - |
| **Fragment Shader** | 색상 결정 담당 셰이더 | - |

### Canvas 2D vs WebGL
```
Canvas 2D  →  CPU가 그림  →  쉽지만 수십만 포인트에서 버벅임
WebGL      →  GPU가 그림  →  어렵지만 수십만 포인트도 빠름
```

### uniform vs attribute
```
uniform   →  모든 점 공통  (뷰 범위: xMin, xMax, yMin, yMax)
attribute →  점마다 다름   (데이터: timestamp, value)
```

줌/팬할 때 uniform(뷰 범위)만 바꾸면 GPU가 모든 점 위치를 자동으로 재계산합니다. 데이터(버퍼)는 그대로 놔둡니다.

---

## 프로젝트 전체 구조

```
app/
├── page.tsx                          # 메인 페이지 ("use client" 필수)
│
├── actions/
│   └── fetchTemperature.ts           # 서버 액션 (레거시, useChartData로 대체됨)
│
└── components/
    ├── WebGLLineChart.tsx            # ★ 범용 차트 컴포넌트 (config를 받아 렌더링)
    ├── D3WebGLChart.tsx              # 레거시 (온도 전용 하드코딩 버전)
    └── chart/
        └── ChartCanvasStack.tsx      # 캔버스 3장 + 툴팁 DOM 스택

config/
└── charts/
    ├── index.ts                      # ★ 전체 config 등록부
    └── temperatureConfig.ts          # ★ 온도 차트 config (팀원 복붙용 예시)

hooks/
├── useChartData.ts                   # ★ 범용 데이터 훅 (dataUrl로 fetch)
└── chart/
    ├── useWebGLLineLayer.ts
    ├── useAxesLayer.ts
    ├── useCursorLayer.ts
    └── useChartInteractions.ts

lib/
└── chart/
    ├── chartConfig.ts                # ★ LineChartConfig 타입 정의 (PR 리뷰 필수)
    ├── types.ts
    ├── webgl.ts
    ├── overlay2d.ts
    └── math.ts

public/
└── mock-weather.json                 # 시계열 온도 mock 데이터
```

★ 표시가 있는 파일이 리팩토링으로 새로 추가된 파일입니다.

---

## 팀원이 새 차트를 추가하는 방법

> **이것만 알면 됩니다.** `WebGLLineChart.tsx`나 `lib/chart/` 파일들은 건드리지 않아도 됩니다.

### 1단계 — config 파일 만들기

`config/charts/temperatureConfig.ts`를 복사해서 새 파일을 만드세요.

```typescript
// config/charts/speedConfig.ts
import type { LineChartConfig } from "@/lib/chart/chartConfig";
import * as d3 from "d3";

export const SPEED_CONFIG: LineChartConfig = {
  title: "속도",

  lines: [
    {
      dataUrl: "/api/speed",       // ← 실제 API endpoint로 교체
      xKey: "timestamps",          // ← 응답 JSON의 x값 키
      yKey: "speeds",              // ← 응답 JSON의 y값 키
      label: "속도",
      color: "#16a34a",            // ← 선 색상 hex
      formatY: (v) => `${v.toFixed(0)}km/h`,
    },
  ],

  xType: "time",                   // 시간 데이터면 "time", 숫자면 "linear"
  yLabel: "km/h",

  // y축 범위 고정이 필요할 때만 사용. 없으면 데이터 기반 자동 계산.
  // yMin: 0,
  // yMax: 200,

  formatTooltip: (x, y, label) =>
    `${d3.timeFormat("%Y-%m-%d %H:%M")(new Date(x))}  ${label}: ${y.toFixed(0)}km/h`,

  height: 540,
};
```

### 2단계 — index.ts에 등록

```typescript
// config/charts/index.ts
export { TEMPERATURE_CONFIG } from "./temperatureConfig";
export { SPEED_CONFIG } from "./speedConfig";  // ← 한 줄 추가
```

### 3단계 — page.tsx에 차트 추가

```tsx
// app/page.tsx
"use client";

import { WebGLLineChart } from "@/components/WebGLLineChart";
import { TEMPERATURE_CONFIG } from "@/config/charts/temperatureConfig";
import { SPEED_CONFIG } from "@/config/charts/speedConfig";

export default function D3WebGLPage() {
  return (
    <div className="w-full p-6">
      <WebGLLineChart config={TEMPERATURE_CONFIG} />
      <WebGLLineChart config={SPEED_CONFIG} />
    </div>
  );
}
```

끝입니다. `WebGLLineChart.tsx`나 `lib/chart/` 파일은 건드리지 않아도 됩니다.

---

## 데이터 API 응답 형식

`useChartData`가 지원하는 JSON 형식은 두 가지입니다.

**형식 A — 배열 키 (현재 mock-weather.json 형식)**
```json
{
  "timestamps": [1041379200000, 1041382800000],
  "temperatures": [20.1, 19.8]
}
```
→ config에서 `xKey: "timestamps"`, `yKey: "temperatures"`로 지정

**형식 B — 객체 배열**
```json
[
  { "timestamp": 1041379200000, "temperature": 20.1 },
  { "timestamp": 1041382800000, "temperature": 19.8 }
]
```
→ config에서 `xKey: "timestamp"`, `yKey: "temperature"`로 지정

---

## 주의사항

### page.tsx에 "use client" 필수
config 안에 함수(`formatY`, `formatTooltip`)가 포함되어 있어서, 서버 컴포넌트에서 `WebGLLineChart`에 config를 넘기면 Next.js 오류가 납니다. `page.tsx` 최상단에 반드시 `"use client"`를 붙이세요.

```tsx
"use client";  // ← 없으면 오류남
```

### chartConfig.ts는 팀 전체 논의 후 수정
`lib/chart/chartConfig.ts`의 타입이 바뀌면 모든 config 파일에 영향을 줍니다. 이 파일을 수정할 때는 반드시 PR 리뷰를 받으세요.

### y축 단위가 다른 데이터는 한 차트에 넣지 마세요
예를 들어 온도(°C)와 습도(%)는 단위가 달라서 y축을 공유하면 그래프가 왜곡됩니다. 단위가 다른 데이터는 별도 `WebGLLineChart`로 분리하세요.

---

## 코드 읽는 순서 (처음 합류한 팀원)

### 1단계 — 데이터 형태 파악 (5분)
**`public/mock-weather.json`**

차트 코드를 읽기 전에 "이 차트가 어떤 데이터를 그리는가"를 눈으로 확인합니다.

### 2단계 — 타입 읽기 (10분)
**`lib/chart/chartConfig.ts`** → **`lib/chart/types.ts`**

`LineChartConfig`가 차트 설정의 전체 인터페이스입니다. `WebGLState`와 `ChartState`가 어떤 필드를 들고 있는지 파악합니다.

```typescript
interface WebGLState {
  gl            // WebGL 컨텍스트
  program       // 컴파일된 셰이더 프로그램
  xBuf, yBuf    // 데이터가 올라가 있는 GPU 버퍼
  uXMin, uXMax  // 줌/팬할 때 바뀌는 뷰 범위 (uniform 주소)
  uYMin, uYMax
  aX, aY        // 버퍼와 셰이더를 연결하는 attribute 주소
}
```

### 3단계 — 진입점 읽기 (10분)
**`app/page.tsx`** → **`config/charts/temperatureConfig.ts`** → **`components/WebGLLineChart.tsx`**

`page.tsx`가 config를 만들어서 `WebGLLineChart`에 넘깁니다. `WebGLLineChart`가 허브 역할을 합니다.

읽으면서 이 질문에 답해보세요:
- `xScale`, `yScale`이 언제 만들어지고 어디에 쓰이는가?
- 각 훅(`useWebGLLineLayer`, `useAxesLayer` 등)에 어떤 값이 들어가는가?

#### WebGLLineChart가 들고 있는 것들
```typescript
// DOM 참조
containerRef       // 마우스 이벤트 바인딩할 최상위 div
tooltipRef         // 툴팁 DOM 직접 조작 (React state 안 씀 → 빠름)

// 차트 상태 (React 밖에서 관리)
chartStateRef      // xScale, yScale, canvas들, cursor 상태 전부
dataRef            // timestamps[], values[] (최신 데이터 보관)

// 캔버스 3장 (DOM이 마운트되면 채워짐)
glCanvas           // WebGL 라인
axisCanvas         // 축/격자
cursorCanvas       // 십자선

containerWidth     // ResizeObserver가 갱신
```

> **왜 `chartStateRef`를 useState가 아닌 useRef로 쓰나?**
> 줌/팬마다 setState를 하면 React 리렌더가 발생해서 느려집니다. Ref는 값을 바꿔도 리렌더 없이 즉시 반영됩니다.

#### useEffect 목적별 분류
| useEffect | 트리거 | 역할 |
|-----------|--------|------|
| ResizeObserver | 마운트 1회 | containerWidth 갱신 |
| 언마운트 정리 | 언마운트 | ref 청소 |
| **차트 인스턴스 생성** | 캔버스+데이터 준비됐을 때 | xScale/yScale 만들고 첫 draw |
| 데이터 변경 | data 바뀔 때 | GPU 버퍼 재업로드 + redraw |
| 리사이즈 | containerWidth 바뀔 때 | scale range 재계산 + redraw |
| 커서 | 마운트 1회 | mousemove/mouseleave 이벤트 바인딩 |

### 4단계 — 데이터 로딩 흐름 (10분)
**`hooks/useChartData.ts`**

config의 `dataUrl`, `xKey`, `yKey`를 받아서 fetch하고 react-query로 캐싱합니다.

```
config.dataUrl
       ↓
useChartData()       react-query로 캐싱, { timestamps, values } 반환
       ↓
WebGLLineChart       데이터 → 스케일 → 각 레이어로 전달
```

### 5단계 — WebGL 핵심 읽기 (30분, 가장 중요)
**`lib/chart/webgl.ts`** → **`hooks/chart/useWebGLLineLayer.ts`**

`webgl.ts`가 순수 함수들이고, `useWebGLLineLayer`가 그걸 React 생명주기에 연결합니다.

#### webgl.ts 함수 4개
```
createVertexShaderSource()  → GPU 프로그램 코드(문자열) 생성
createProgram()             → 그 코드를 컴파일해서 GPU에 올림
uploadLineData()            → 데이터를 GPU 메모리에 전송 (데이터 변경시 1회)
drawWebGLLine()             → 실제로 선을 그림 (줌/팬마다 호출)
```

#### 버텍스 셰이더 좌표 변환 3단계
```
① 데이터 좌표 → 0~1 정규화
   nx = (timestamp - xMin) / (xMax - xMin)

② 픽셀 좌표로 변환 (margin 고려)
   px = marginL + nx * innerW
   py = marginT + (1 - ny) * innerH   ← y는 위아래 뒤집힘

③ NDC로 변환 (WebGL 좌표계)
   ndcX = (px / width) * 2 - 1
   ndcY = 1 - (py / height) * 2
```

> **GLSL(셰이더 언어)은 지금 몰라도 됩니다.** "GPU가 좌표 변환하는 코드구나" 정도로만 이해하고 넘어가세요.

#### drawWebGLLine 흐름
```typescript
gl.viewport(...)          // 뷰포트 설정
gl.clear(...)             // 이전 프레임 지우기
gl.scissor(...)           // margin 밖으로 선이 삐져나가지 않게 클리핑
gl.uniform1f(uXMin, ...) // 현재 뷰 범위를 셰이더에 전달 ← 줌/팬의 핵심
gl.uniform1f(uXMax, ...)
gl.bindBuffer(...)        // GPU 버퍼 → 셰이더 attribute 연결
gl.drawArrays(LINE_STRIP) // GPU가 선을 그림
```

줌/팬 때 실제로 바뀌는 건 uniform 4개(`xMin/xMax/yMin/yMax`)뿐입니다.

### 6단계 — 축/커서 오버레이 (15분)
**`lib/chart/overlay2d.ts`** → **`hooks/chart/useAxesLayer.ts`** → **`hooks/chart/useCursorLayer.ts`**

Canvas 2D API라서 WebGL보다 읽기 편합니다.

| 보이는 범위 | x축 포맷 | 예시 |
|------------|----------|------|
| 1년 이상 | `%Y/%m` | `2024/03` |
| 30일~1년 | `%m/%d` | `03/15` |
| 1일~30일 | `%m/%d %H:%M` | `03/15 14:00` |
| 1일 이하 | `%H:%M` | `14:00` |

### 7단계 — 인터랙션 (15분)
**`hooks/chart/useChartInteractions.ts`**

줌/팬 이벤트가 어떻게 `xScale/yScale`의 domain을 바꾸고 `drawChartNow()`를 호출하는지 확인하면 전체 사이클이 완성됩니다.

#### 핵심 사이클
```
마우스 휠
  → xScale.domain() 수정
  → drawChartNow() 호출
  → drawWebGLLine(): uniform(xMin/xMax) 업데이트
  → GPU가 모든 점 좌표 재계산
  → 화면 갱신
```

---

## 레이어 구조 요약

```
┌──────────────────────────────┐  (맨 위)
│  tooltip div                 │  마우스 근처에 시간/값 표시
├──────────────────────────────┤
│  cursor canvas (Canvas 2D)   │  십자선 + 파란 점
├──────────────────────────────┤
│  axis canvas (Canvas 2D)     │  x/y축 + 격자선 + 라벨
├──────────────────────────────┤
│  WebGL canvas                │  데이터 라인 (GPU 렌더링)
└──────────────────────────────┘  (맨 아래)
```

cursor/axis 캔버스는 `pointer-events: none`이라 마우스 이벤트는 컨테이너 div에서만 처리합니다.

---

## 성능 포인트 요약

| 포인트 | 이유 |
|--------|------|
| `chartStateRef`를 useRef로 관리 | 줌/팬마다 setState → React 리렌더 → 느려짐 |
| GPU 버퍼 재사용 | 줌/팬 때 데이터 재업로드 안 함. uniform만 바꿈 |
| 레이어 분리 | 커서 이동 시 WebGL/축을 다시 그리지 않아도 됨 |
| Scissor Test | 선이 margin 밖으로 삐져나가지 않게 GPU 레벨에서 클리핑 |

---

## D3의 역할 (이 프로젝트에서)

D3가 DOM을 직접 그리지 않습니다. 계산 도구로만 사용합니다.

| D3 기능 | 용도 |
|---------|------|
| `d3.scaleTime()` | 타임스탬프 → 픽셀 좌표 변환 |
| `d3.scaleLinear()` | 값 → 픽셀 좌표 변환 |
| `d3.timeFormat()` | 시간 포맷팅 (축 라벨, 툴팁) |
| `d3.bisector()` | 이진 탐색으로 가장 가까운 데이터 포인트 찾기 |
| `scale.ticks()` | 축 눈금 위치 자동 계산 |
| `scale.invert()` | 픽셀 좌표 → 데이터 값 역변환 |

---

## Git 브랜치 전략

차트 단위로 브랜치를 만들면 conflict를 최소화할 수 있습니다.

```
main
├── feature/chart-temperature   (담당자 A)
├── feature/chart-speed         (담당자 B)
└── feature/chart-pressure      (담당자 C)
```

각자 자기 config 파일만 건드리므로 conflict가 거의 발생하지 않습니다. 공용 파일(`chartConfig.ts`, `WebGLLineChart.tsx`)을 수정할 때만 팀 전체가 논의하세요.