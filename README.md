# D3 WebGL Line Chart

GPU 가속 기반의 대규모 시계열 데이터 시각화 라이브러리입니다.  
20만~50만 점의 데이터를 WebGL로 렌더링하고, D3로 축·인터랙션을 처리합니다.

---

## 목차

1. [왜 WebGL인가](#왜-webgl인가)
2. [아키텍처 개요](#아키텍처-개요)
3. [용어 사전](#용어-사전)
4. [프로젝트 구조](#프로젝트-구조)
5. [싱글라인 차트 사용법](#싱글라인-차트-사용법)
6. [멀티라인 차트 사용법](#멀티라인-차트-사용법)
7. [LineChartConfig 레퍼런스](#linechartconfig-레퍼런스)
8. [데이터 포맷](#데이터-포맷)
9. [렌더링 파이프라인](#렌더링-파이프라인)
10. [성능 주의사항](#성능-주의사항)
11. [알려진 제한사항](#알려진-제한사항)

---

## 왜 WebGL인가

### SVG / Canvas 2D의 한계

일반적인 D3 차트는 SVG나 Canvas 2D로 렌더링합니다.

| 방식 | 최대 안정 점 수 | 줌/팬 성능 | 비고 |
|------|----------------|-----------|------|
| SVG | ~5,000점 | 느림 | 점마다 DOM 노드 생성 |
| Canvas 2D | ~50,000점 | 보통 | CPU가 점을 하나씩 순차 처리 |
| **WebGL (이 프로젝트)** | **500,000점+** | **빠름** | GPU 병렬 처리 |

SVG는 점마다 DOM 노드를 만들기 때문에 1만 점이 넘으면 버벅입니다.  
Canvas 2D는 CPU가 점을 순서대로 그리기 때문에 5만 점부터 느려집니다.

WebGL은 모든 데이터를 **GPU 메모리에 한 번 올려두고**, 줌/팬 시에는 좌표 변환 수식만 바꿔서 GPU가 전체를 다시 그립니다. CPU는 거의 관여하지 않습니다.

### D3와의 역할 분담

D3와 WebGL은 각자 잘하는 일만 담당합니다.

```
┌─────────────────────────────────────────────────┐
│  WebGL Canvas  (GPU)                            │
│  역할: 라인 수십만 점 고속 렌더링               │
│  줌/팬 → uniform 값만 변경, 재업로드 없음       │
├─────────────────────────────────────────────────┤
│  Axis Canvas  (CPU / Canvas 2D)                 │
│  역할: D3로 x축·y축·눈금·레이블 그리기         │
├─────────────────────────────────────────────────┤
│  Cursor Canvas  (CPU / Canvas 2D)               │
│  역할: 마우스 추적선·데이터 포인트 그리기       │
└─────────────────────────────────────────────────┘
```

---

## 아키텍처 개요

```
WebGLLineChart (싱글라인)
├── useChartData           데이터 fetch + viewRange 관리
├── useWebGLLineLayer      WebGL 초기화 + 셰이더 컴파일
├── useAxesLayer           D3 축 그리기 (Canvas 2D)
├── useCursorLayer         커서 오버레이 (Canvas 2D)
├── useChartInteractions   휠줌, 드래그팬 이벤트 처리
└── ChartCanvasStack       3개 캔버스를 position:absolute로 쌓는 컴포넌트

WebGLMultiLineChart (멀티라인)
├── useChartData           동일
├── useWebGLLineLayer      셰이더 컴파일 전용 (버퍼는 lineBufsRef로 직접 관리)
├── lineBufsRef            라인별 GPU 버퍼 (컴포넌트 내부 ref)
└── ... (나머지 동일)
```

---

## 용어 사전

### WebGL 핵심 용어

| 용어 | 설명 |
|------|------|
| **WebGL** | 브라우저에서 GPU를 직접 쓸 수 있는 JavaScript API. OpenGL ES 2.0 기반 |
| **셰이더 (Shader)** | GPU에서 실행되는 소형 프로그램. GLSL 언어로 작성 |
| **버텍스 셰이더 (Vertex Shader)** | 점(vertex) 하나의 화면 좌표를 계산하는 셰이더. 모든 점에 대해 GPU가 병렬 실행 |
| **프래그먼트 셰이더 (Fragment Shader)** | 픽셀 하나의 색상을 결정하는 셰이더 |
| **버퍼 (Buffer / VBO)** | GPU 메모리에 올라간 데이터 배열. 이 프로젝트에서는 x버퍼, y버퍼를 분리해서 사용 |
| **uniform** | CPU → GPU로 전달하는 상수값. 줌/팬 시 `u_viewStart`, `u_viewEnd`, `u_yMin`, `u_yMax`를 변경 |
| **attribute** | 버퍼에서 점마다 읽어오는 데이터. `a_x`, `a_y` |
| **NDC** | Normalized Device Coordinates. WebGL 기본 좌표계로 x·y 모두 -1~1 범위. 좌하단이 (-1,-1) |
| **GLSL** | OpenGL Shading Language. 셰이더를 작성하는 C 유사 언어 |
| **gl.STATIC_DRAW** | 데이터를 한 번 올리고 자주 읽는 용도. 멀티라인 버퍼에 사용 |
| **gl.DYNAMIC_DRAW** | 데이터를 자주 바꾸는 용도. 싱글라인 데이터 갱신에 사용 |
| **Scissor Test** | 지정한 사각형 밖의 픽셀은 그리지 않는 클리핑. margin 영역을 넘어 그려지지 않도록 사용 |
| **Blend** | 반투명 합성. 멀티라인에서 꺼진 라인을 흐릿하게 표시할 때 사용 |

### Float32 정밀도 문제와 해결책

WebGL 버퍼는 기본적으로 `Float32` 타입을 사용합니다. Float32는 유효 자릿수가 7자리뿐이라 Unix timestamp(ms)를 그대로 넣으면 수십 초 단위 오차가 발생합니다.

```
Unix timestamp 예시:  1,700,000,000,000 ms
Float32 변환 후:      1,700,000,040,960 ms  ← 약 40초 오차 발생
```

이 프로젝트는 timestamp를 GPU에 올리기 전에 **CPU에서 [0, 1]로 정규화**합니다.

```
정규화값 = (timestamp - 전체시작) / 전체스팬
```

0~1 범위의 소수는 Float32로도 정밀도가 충분합니다.  
줌/팬 시에는 `u_viewStart`, `u_viewEnd`(0~1 범위)만 변경하고 버퍼는 재업로드하지 않습니다.

### D3 용어

| 용어 | 설명 |
|------|------|
| **Scale** | 데이터값 → 픽셀 좌표 변환 함수. `xScale(new Date(...))` → 픽셀 x 좌표 |
| **scaleTime** | Date 객체를 입력받는 시간 스케일 |
| **scaleLinear** | 숫자를 선형으로 매핑하는 스케일 |
| **domain** | 스케일의 입력 범위. `[시작Date, 끝Date]` |
| **range** | 스케일의 출력 픽셀 범위. `[0, innerW]` |
| **bisector** | 정렬된 배열에서 특정 값의 삽입 위치를 이진 탐색으로 찾는 유틸. 커서 스냅핑에 사용 |

### 차트 내부 용어

| 용어 | 설명 |
|------|------|
| **MARGIN** | 차트 테두리 여백. 축 레이블을 그리는 공간. `{ top, right, bottom, left }` |
| **innerW / innerH** | 실제 데이터가 그려지는 영역의 가로/세로. `containerWidth - margin.left - margin.right` |
| **ChartState** | xScale, yScale, 캔버스, WebGL 상태 등 차트 인스턴스 전체를 하나의 ref로 관리하는 객체 |
| **WebGLState** | WebGL 컨텍스트, 셰이더 프로그램, 버퍼, uniform 위치를 담은 객체 |
| **viewRange** | 현재 화면에 보이는 x축 시간 범위 (ms 단위). 줌/팬 시 업데이트됨 |
| **domainStartMs** | 전체 데이터의 첫 번째 timestamp. Float32 정규화의 기준 시작값 |
| **domainSpanMs** | 전체 데이터의 시간 스팬. Float32 정규화의 기준 분모 |
| **lineBufsRef** | 멀티라인 전용. 라인별 GPU 버퍼를 컴포넌트 내부에서 직접 관리하는 ref |

---

## 프로젝트 구조

```
app/
├── page.tsx                         싱글라인 차트 페이지 (온도)
├── wind/
│   └── page.tsx                     멀티라인 차트 페이지 (풍속 비교)
│
├── components/chart/
│   ├── ChartCanvasStack.tsx         WebGL · Axis · Cursor 3-레이어 캔버스 스택
│   ├── WebGLLineChart.tsx           싱글라인 차트 컴포넌트
│   └── WebGlMultiLineChart.tsx      멀티라인 차트 컴포넌트
│
├── config/charts/
│   ├── index.ts                     config export 모음
│   ├── temperatureConfig.ts         싱글라인 예시 (온도)
│   └── windConfig.ts                멀티라인 예시 (풍속 비교)
│
├── hooks/
│   ├── useChartData.ts              데이터 fetch · viewRange 관리
│   └── chart/
│       ├── useAxesLayer.ts          D3 축 Canvas 2D 렌더링
│       ├── useCursorLayer.ts        커서 오버레이 렌더링
│       ├── useChartInteractions.ts  휠줌 · 드래그팬 이벤트
│       └── useWebGLLineLayer.ts     WebGL 초기화 · 셰이더 컴파일
│
└── lib/chart/
    ├── types.ts        WebGLState, ChartState 타입 정의
    ├── webgl.ts        셰이더 소스, 버퍼 업로드, 렌더 함수
    ├── math.ts         clampViewRangeMs, clampYRange, countVisiblePoints 유틸
    ├── overlay2d.ts    Canvas 2D 축·커서 그리기 유틸
    └── chartConfig.ts  LineChartConfig, LineSeries 타입 정의
```

---

## 싱글라인 차트 사용법

하나의 라인을 렌더링할 때 `WebGLLineChart`를 사용합니다.

### 1. config 작성

`config/charts/` 아래에 파일을 만듭니다. 실제 온도 차트 예시:

```typescript
// config/charts/temperatureConfig.ts
import type { LineChartConfig } from "@/lib/chart/chartConfig";
import * as d3 from "d3";

export const TEMPERATURE_CONFIG: LineChartConfig = {
  title: "온도",

  lines: [
    {
      dataUrl: "/mock-weather.json",  // public/ 기준 경로
      xKey: "timestamps",             // JSON에서 x축으로 쓸 키
      yKey: "temperatures",           // JSON에서 y축으로 쓸 키
      label: "온도",
      color: "#2563eb",
      formatY: (v) => `${v.toFixed(1)}°C`,
    },
  ],

  xType: "time",    // timestamp 데이터이므로 "time"
  yLabel: "°C",

  // yMin / yMax를 생략하면 데이터 기반으로 자동 계산
  // yMin: -20,
  // yMax: 40,

  formatTooltip: (x, y, label) =>
    `${d3.timeFormat("%Y-%m-%d %H:%M")(new Date(x))}  ${label}: ${y.toFixed(1)}°C`,

  height: 540,
};
```

### 2. config/charts/index.ts에 export 추가

```typescript
export { TEMPERATURE_CONFIG } from "./temperatureConfig";
```

### 3. 페이지에서 사용

```tsx
// app/page.tsx
import { WebGLLineChart } from "@/components/chart/WebGLLineChart";
import { TEMPERATURE_CONFIG } from "@/config/charts";

export default function Page() {
  return (
    <main className="p-6">
      <WebGLLineChart config={TEMPERATURE_CONFIG} />
    </main>
  );
}
```

---

## 멀티라인 차트 사용법

여러 라인을 하나의 차트에 렌더링할 때 `WebGLMultiLineChart`를 사용합니다.  
**y축 단위가 같은 데이터**를 비교할 때 적합합니다.

### 1. config 작성

`lines` 배열에 라인을 여러 개 넣습니다. 실제 풍속 비교 예시:

```typescript
// config/charts/windConfig.ts
import type { LineChartConfig } from "@/lib/chart/chartConfig";
import * as d3 from "d3";

export const WIND_CONFIG: LineChartConfig = {
  title: "풍속 비교 — 런던 vs 한국 (2024)",

  lines: [
    {
      dataUrl: "/mock-wind.json",
      xKey: "timestamps",
      yKey: "london",           // 같은 파일에서 다른 키를 각각 지정
      label: "런던",
      color: "#2563eb",         // 파란색
      formatY: (v) => `${v.toFixed(1)} m/s`,
    },
    {
      dataUrl: "/mock-wind.json",
      xKey: "timestamps",
      yKey: "korea",
      label: "한국",
      color: "#dc2626",         // 빨간색
      formatY: (v) => `${v.toFixed(1)} m/s`,
    },
  ],

  xType: "time",
  yLabel: "m/s",
  yMin: 0,                      // 풍속은 0 이하가 없으므로 고정

  formatTooltip: (x, y, label) =>
    `${d3.timeFormat("%Y-%m-%d %H:%M")(new Date(x))}  ${label}: ${y.toFixed(1)} m/s`,

  height: 540,
};
```

### 2. 페이지에서 사용

```tsx
// app/wind/page.tsx
import { WebGLMultiLineChart } from "@/components/chart/WebGlMultiLineChart";
import { WIND_CONFIG } from "@/config/charts";

export default function WindPage() {
  return (
    <main className="p-6">
      <WebGLMultiLineChart config={WIND_CONFIG} />
    </main>
  );
}
```

### 멀티라인 전용 기능

**라인 토글** — 차트 오른쪽 범례 버튼을 클릭하면 라인을 켜고 끌 수 있습니다.  
꺼진 라인은 흐릿하게 표시되고, 툴팁에서도 제외됩니다.

**성능 최적화** — 멀티라인은 라인별 GPU 버퍼를 초기화 시점에 한 번만 올립니다.  
줌/팬·토글 시에는 버퍼를 재업로드하지 않고 `uniform`과 `alpha`만 변경합니다.

---

## LineChartConfig 레퍼런스

```typescript
interface LineChartConfig {
  title?: string;            // 차트 제목 (선택)
  lines: LineSeries[];       // 라인 목록. 1개 = 싱글라인, 2개 이상 = 멀티라인
  xType: "time" | "linear"; // x축 타입. timestamp 데이터면 반드시 "time"
  yLabel: string;            // y축 단위 라벨. 예: "°C", "m/s", "hPa"
  yMin?: number;             // y축 최솟값 고정. 생략 시 데이터 기반 자동 계산
  yMax?: number;             // y축 최댓값 고정. 생략 시 데이터 기반 자동 계산
  formatTooltip: (x: number, y: number, label: string) => string;
  height?: number;           // 차트 높이(px). 기본값 540
}

interface LineSeries {
  dataUrl: string;           // fetch 경로. public/ 기준 상대 경로 또는 API URL
  xKey: string;              // JSON에서 x값으로 쓸 키. 예: "timestamps"
  yKey: string;              // JSON에서 y값으로 쓸 키. 예: "temperatures"
  label: string;             // 범례·툴팁 표시 이름
  color: string;             // 선 색상 hex. 예: "#2563eb"
  formatY: (value: number) => string; // y값 포맷터. 축·툴팁에 사용
}
```

### yMin / yMax 가이드

| 상황 | 권장 |
|------|------|
| 풍속, 강수량 등 0 이하가 없는 데이터 | `yMin: 0` 고정 |
| 기온 등 음수가 있는 데이터 | 생략 (자동 계산) |
| 센서 범위가 명확한 데이터 | `yMin`, `yMax` 모두 고정 |
| 탐색·비교 목적의 데이터 | 생략 (데이터에 맞게 자동 조정) |

### formatTooltip 작성법

`x`는 timestamp(ms), `y`는 해당 라인의 값, `label`은 `LineSeries.label`입니다.

```typescript
// 날짜 + 값 표시
formatTooltip: (x, y, label) =>
  `${d3.timeFormat("%Y-%m-%d %H:%M")(new Date(x))}  ${label}: ${y.toFixed(1)}°C`

// 멀티라인에서는 label로 라인을 구분합니다
// 툴팁은 커서 위치의 가장 가까운 데이터 포인트에 자동 스냅됩니다
```

---

## 데이터 포맷

`public/` 폴더에 JSON 파일을 넣습니다. 두 가지 포맷을 지원합니다.

### 포맷 A — 컬럼 배열 방식 (권장)

각 키에 배열을 넣는 방식입니다. 같은 파일에서 여러 라인을 뽑을 수 있어 멀티라인에 적합합니다.

```json
{
  "timestamps":   [1704067200000, 1704070800000, 1704074400000],
  "temperatures": [3.2, 3.8, 4.1]
}
```

멀티라인에서 같은 파일을 두 라인이 공유할 때:

```json
{
  "timestamps": [1704067200000, 1704070800000, 1704074400000],
  "london":     [4.2, 3.8, 5.1],
  "korea":      [2.1, 2.4, 1.9]
}
```

### 포맷 B — 행(row) 배열 방식

각 항목이 하나의 시점을 나타내는 방식입니다.

```json
[
  { "timestamp": 1704067200000, "value": 3.2 },
  { "timestamp": 1704070800000, "value": 3.8 },
  { "timestamp": 1704074400000, "value": 4.1 }
]
```

> **주의**: timestamp는 반드시 **Unix ms** 단위여야 합니다. `new Date().getTime()`의 반환값과 동일한 형식입니다.

> **주의**: timestamp 배열은 반드시 **오름차순 정렬**되어 있어야 합니다. 정렬이 깨지면 커서 bisector가 잘못된 인덱스를 반환합니다.

---

## 렌더링 파이프라인

### 초기화 (마운트 시 1회)

```
1. useChartData        JSON fetch → timestamps, values 배열 반환
2. useWebGLLineLayer   WebGL 컨텍스트 생성 → 셰이더 컴파일 → 프로그램 링크
3. uploadLineData      timestamps를 [0,1]로 정규화 → Float32Array → GPU 버퍼 업로드
4. D3 스케일 생성      xScale (scaleTime), yScale (scaleLinear)
5. drawChartNow 호출
   ├── drawWebGLLine   uniform 설정 → gl.drawArrays(LINE_STRIP)
   └── drawAxes        D3 axis → Canvas 2D 렌더링
```

### 줌/팬 (이벤트마다)

```
wheel / drag 이벤트 발생
  ↓
xScale.domain() 변경  (ms 단위 Date 객체 그대로 유지)
  ↓
drawChartNow 호출
  ├── viewStart = (xDomain[0].getTime() - domainStartMs) / domainSpanMs
  ├── viewEnd   = (xDomain[1].getTime() - domainStartMs) / domainSpanMs
  ├── gl.uniform1f(uViewStart, viewStart)   ← uniform만 교체
  ├── gl.uniform1f(uViewEnd,   viewEnd)
  └── gl.drawArrays(LINE_STRIP)             ← GPU가 전체 재렌더링 (CPU 재업로드 없음)
```

### 싱글라인 vs 멀티라인 내부 차이

| | 싱글라인 | 멀티라인 |
|--|---------|---------|
| GPU 버퍼 관리 | `useWebGLLineLayer` 내부 | `lineBufsRef`로 직접 관리 |
| 버퍼 힌트 | `gl.DYNAMIC_DRAW` | `gl.STATIC_DRAW` |
| 데이터 변경 시 | `uploadLineData` 재호출 | 재업로드 없음 |
| 라인 색상 | `drawWebGLLine`에 color 인자 전달 | 라인별 `hexToRgb` 후 uniform 설정 |
| 라인 토글 | 없음 | `activeLines` state + `DIMMED_ALPHA` |

---

## 성능 주의사항

**GPU 버퍼는 초기화 시 한 번만 올리세요.**  
멀티라인에서 `lineBufsRef`에 올린 버퍼는 줌/팬·토글 시 재업로드하지 않습니다.  
`gl.bufferData`를 줌/팬 루프 안에서 호출하면 성능이 급격히 저하됩니다.

**timestamp는 반드시 정규화 후 Float32Array로 변환하세요.**

```typescript
// 잘못된 방법 — Float32 정밀도 손실로 수십 초 오차 발생
const xs = new Float32Array(timestamps);

// 올바른 방법 — 정규화 후 업로드
const xs = new Float32Array(timestamps.map(t => (t - domainStart) / domainSpan));
```

**Scissor Test를 항상 활성화하세요.**  
`gl.enable(gl.SCISSOR_TEST)`로 margin 영역 밖으로 라인이 삐져나오는 것을 막습니다.

**언마운트 시 GPU 버퍼를 정리하세요.**  
`gl.deleteBuffer()`를 호출하지 않으면 GPU 메모리가 누수됩니다.

```typescript
useEffect(() => {
  return () => {
    lineBufsRef.current.forEach(({ xBuf, yBuf }) => {
      wgl.gl.deleteBuffer(xBuf);
      wgl.gl.deleteBuffer(yBuf);
    });
  };
}, []);
```

---

## 알려진 제한사항

**`xType: "linear"` 미구현**  
`chartConfig.ts`에 타입은 정의되어 있으나 셰이더와 스케일 생성 로직이 `"time"` 기준으로만 구현되어 있습니다. 일반 숫자 x축이 필요하면 `xScale`을 `scaleLinear`로 교체하고 `u_viewStart/u_viewEnd` 계산식을 수정해야 합니다.

**y축 드래그 범위 제한 없음**  
드래그로 y축을 위아래로 이동할 수 있지만 데이터 범위 밖으로 나가면 빈 화면이 됩니다. `clampYRange`에 `hardMin`, `hardMax`를 전달해 제한할 수 있습니다.

**멀티라인 커서가 첫 번째 라인 기준으로 스냅**  
커서 점은 항상 첫 번째 라인의 y값에 위치합니다. 켜진 라인 중 가장 가까운 라인으로 스냅하려면 `useCursorLayer` 로직 수정이 필요합니다.

**멀티라인은 동일 파일에서만 데이터 공유 가능**  
`useChartData`는 `lines[0].dataUrl` 하나만 fetch합니다. 라인마다 다른 URL이 필요한 경우 `useChartData`를 확장해야 합니다.

**WebGL 미지원 환경**  
`canvas.getContext("webgl")`이 `null`을 반환하는 환경에서는 차트가 표시되지 않습니다. 컴포넌트에 `"use client"` 지시어가 붙어 있어 SSR은 방지되어 있습니다.