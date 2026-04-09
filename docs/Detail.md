# D3 WebGL Line Chart — 심화 가이드

이 문서는 README를 읽고 프로젝트 사용법을 이해한 사람이  
**처음부터 동일한 구조를 직접 세팅할 때** 참고하는 문서입니다.

각 레이어가 왜 이렇게 설계됐는지, 어떤 설정이 필요한지를 다룹니다.

---

## 목차

1. [전체 구조 한눈에 보기](#전체-구조-한눈에-보기)
2. [패키지 설치](#패키지-설치)
3. [캔버스 레이어 구조](#캔버스-레이어-구조)
4. [WebGL 초기화 순서](#webgl-초기화-순서)
5. [셰이더 설계](#셰이더-설계)
6. [Float32 정밀도 문제와 해결책](#float32-정밀도-문제와-해결책)
7. [D3 스케일 설계](#d3-스케일-설계)
8. [줌/팬 인터랙션 설계](#줌팬-인터랙션-설계)
9. [범위 제한 (clamp) 설계](#범위-제한-clamp-설계)
10. [dynamic fetch 설계](#dynamic-fetch-설계)
11. [타입 설계](#타입-설계)
12. [처음부터 만들 때 순서](#처음부터-만들-때-순서)

---

## 전체 구조 한눈에 보기

```
브라우저 화면
  │
  ├── WebGL Canvas       GPU가 라인을 그림. 수십만 점도 빠름
  ├── Axis Canvas        CPU(Canvas 2D)가 D3로 축/눈금을 그림
  └── Cursor Canvas      CPU(Canvas 2D)가 마우스 추적선을 그림

세 캔버스는 position: absolute로 완전히 겹쳐있음
사용자 눈에는 하나의 차트처럼 보임
```

핵심 분업:

| 역할 | 담당 | 이유 |
|------|------|------|
| 라인 렌더링 | WebGL (GPU) | 수십만 점을 병렬 처리 |
| 축·눈금 | Canvas 2D + D3 | 텍스트·복잡한 레이아웃은 CPU가 유리 |
| 마우스 커서 | Canvas 2D | 매 mousemove마다 그려야 하므로 분리 |
| 좌표 변환 | D3 Scale | xScale, yScale이 데이터 → 픽셀 변환 담당 |

---

## 패키지 설치

```bash
npm install d3
npm install @tanstack/react-query
```

D3는 전체를 import하지 않고 필요한 모듈만 씁니다.

```typescript
import * as d3 from "d3";
// 또는 트리셰이킹을 원하면
import { scaleTime, scaleLinear, bisector, timeFormat } from "d3";
```

WebGL은 브라우저 내장 API라 별도 설치 없습니다.  
`canvas.getContext("webgl")`로 바로 사용합니다.

### QueryProvider 설정

`@tanstack/react-query`를 사용하려면 앱 루트에 `QueryClientProvider`가 필요합니다.

```tsx
// app/components/QueryProvider.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

```tsx
// app/layout.tsx
import { QueryProvider } from "@/components/QueryProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
```

---

## 캔버스 레이어 구조

세 캔버스를 겹쳐서 하나의 차트처럼 보이게 합니다.

```tsx
// components/chart/ChartCanvasStack.tsx 구조
<div style={{ position: "relative", width, height }}>
  {/* 1번: WebGL 캔버스 — 맨 아래 */}
  <canvas ref={glCanvasRef}
    style={{ position: "absolute", top: 0, left: 0 }}
    width={width} height={height}
  />

  {/* 2번: Axis 캔버스 — 중간 */}
  <canvas ref={axisCanvasRef}
    style={{ position: "absolute", top: 0, left: 0 }}
    width={width} height={height}
  />

  {/* 3번: Cursor 캔버스 — 맨 위 (이벤트 투과 필요) */}
  <canvas ref={cursorCanvasRef}
    style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    width={width} height={height}
  />

  {/* 툴팁 div */}
  <div ref={tooltipRef}
    style={{ position: "absolute", pointerEvents: "none", transform: "translate(-9999px, -9999px)" }}
  />
</div>
```

**주의사항:**
- `canvas`의 `width`, `height` attribute는 반드시 숫자로 지정해야 합니다. CSS `width: 100%`만 쓰면 내부 해상도가 맞지 않아 흐릿하게 렌더링됩니다.
- Cursor 캔버스에 `pointerEvents: "none"`을 줘야 마우스 이벤트가 아래 컨테이너 div로 전달됩니다.
- 툴팁은 초기에 `translate(-9999px, -9999px)`로 화면 밖에 숨겨두고, mousemove 시 위치를 계산해서 이동시킵니다.

### ResizeObserver로 너비 추적

컨테이너 div의 너비가 바뀔 때 캔버스 크기와 xScale range를 갱신합니다.

```typescript
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry) setContainerWidth(entry.contentRect.width);
  });

  observer.observe(el);
  return () => observer.disconnect();
}, []);
```

리사이즈 시 해야 할 일:

```typescript
useEffect(() => {
  const cs = chartStateRef.current;
  if (!cs || containerWidth === 0) return;

  const { innerW, innerH } = getInnerDims();
  cs.xScale.range([0, innerW]);   // range 갱신
  drawChartNow(cs, innerW, innerH); // 다시 그리기
}, [containerWidth]);
```

---

## WebGL 초기화 순서

WebGL을 사용하려면 아래 순서대로 초기화해야 합니다. 순서가 틀리면 작동하지 않습니다.

```
1. canvas.getContext("webgl")        컨텍스트 획득
2. gl.createShader(VERTEX_SHADER)    버텍스 셰이더 생성
3. gl.shaderSource(shader, src)      셰이더 소스 주입
4. gl.compileShader(shader)          셰이더 컴파일
5. gl.createShader(FRAGMENT_SHADER)  프래그먼트 셰이더 생성
   (동일 과정 반복)
6. gl.createProgram()                프로그램 생성
7. gl.attachShader(program, vShader) 버텍스 셰이더 연결
8. gl.attachShader(program, fShader) 프래그먼트 셰이더 연결
9. gl.linkProgram(program)           프로그램 링크
10. gl.createBuffer()                x버퍼, y버퍼 생성
11. gl.getUniformLocation(...)       uniform 위치 저장
12. gl.getAttribLocation(...)        attribute 위치 저장
```

이 과정을 거쳐야 실제로 데이터를 올리고 그릴 수 있습니다.

### 컨텍스트 획득 시 옵션

```typescript
const gl = canvas.getContext("webgl", {
  antialias: true,  // 선 안티앨리어싱. 선이 부드러워짐
  alpha: true,      // 배경 투명. 다른 캔버스 레이어가 비치도록
});

if (!gl) {
  throw new Error("WebGL을 지원하지 않는 브라우저입니다.");
}
```

### 블렌딩 설정

투명도를 사용하려면 (멀티라인 토글, 꺼진 라인 흐릿하게) 블렌딩을 활성화해야 합니다.

```typescript
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
// 결과 색상 = 소스색상 × 소스알파 + 배경색상 × (1 - 소스알파)
// 일반적인 투명도 합성 공식
```

---

## 셰이더 설계

### 버텍스 셰이더 — 좌표 변환 담당

데이터 좌표를 화면 좌표(NDC)로 변환합니다.

```glsl
attribute float a_x;       // GPU 버퍼에서 점마다 읽어오는 x값 (0~1 정규화값)
attribute float a_y;       // GPU 버퍼에서 점마다 읽어오는 y값 (실제 데이터값)

uniform float u_viewStart; // CPU에서 전달하는 현재 뷰 시작 (0~1)
uniform float u_viewEnd;   // CPU에서 전달하는 현재 뷰 끝   (0~1)
uniform float u_yMin;      // y축 최솟값
uniform float u_yMax;      // y축 최댓값
uniform vec2  u_resolution; // 캔버스 크기 (px)

void main() {
  // 뷰포트 내 상대 위치 계산 (0~1)
  float viewSpan = u_viewEnd - u_viewStart;
  float nx = (a_x - u_viewStart) / viewSpan;
  float ny = (a_y - u_yMin) / (u_yMax - u_yMin);

  // margin을 고려한 픽셀 좌표 계산
  // margin 값은 셰이더 소스 생성 시 JS에서 하드코딩
  float px = marginL + nx * innerW;
  float py = marginT + (1.0 - ny) * innerH; // y축 반전 (WebGL은 아래가 +y)

  // NDC 변환 (-1~1 범위)
  // WebGL 원점은 좌하단, 픽셀 원점은 좌상단이므로 y를 뒤집음
  float ndcX = (px / u_resolution.x) * 2.0 - 1.0;
  float ndcY = 1.0 - (py / u_resolution.y) * 2.0;

  gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);
}
```

**margin은 왜 셰이더에서 처리하나?**  
GPU 버퍼에는 전체 캔버스 좌표계로 올라갑니다. margin(축 레이블 공간)을 셰이더에서 적용해야 WebGL 라인이 축 영역을 침범하지 않습니다.

### 프래그먼트 셰이더 — 색상 담당

```glsl
precision mediump float;
uniform vec4 u_color; // (r, g, b, a) 각각 0~1

void main() {
  gl_FragColor = u_color;
}
```

라인의 모든 픽셀에 같은 색상을 칠합니다. 단순하지만 이 프로젝트에서는 충분합니다.

### uniform vs attribute 차이

| | uniform | attribute |
|--|---------|-----------|
| 전달 단위 | 드로우콜당 1회 | 점(vertex)마다 |
| 용도 | 뷰 범위, 색상, 해상도 | 각 점의 x, y 좌표 |
| 변경 비용 | 매우 저렴 | 버퍼 재업로드 필요 |
| 예시 | `u_viewStart`, `u_color` | `a_x`, `a_y` |

줌/팬 시 uniform만 바꾸고 attribute 버퍼는 그대로 두는 것이 이 프로젝트 성능의 핵심입니다.

### Scissor Test — 클리핑

margin 영역 밖으로 라인이 삐져나오는 것을 GPU 레벨에서 막습니다.

```typescript
gl.enable(gl.SCISSOR_TEST);
// WebGL y원점은 좌하단이므로 margin.bottom을 그대로 사용
gl.scissor(margin.left, margin.bottom, innerW, innerH);

// 그리기
gl.drawArrays(gl.LINE_STRIP, 0, pointCount);

gl.disable(gl.SCISSOR_TEST); // 반드시 해제
```

---

## Float32 정밀도 문제와 해결책

### 왜 문제가 생기나

WebGL 버퍼는 `Float32Array`를 씁니다. Float32의 유효 자릿수는 약 7자리입니다.

```
Unix timestamp(ms): 1,700,000,000,000  ← 13자리
Float32로 변환:     1,700,000,040,960  ← 약 40초 오차 발생
```

이 상태로 셰이더에 올리면 줌인 시 점들이 제자리를 찾지 못하고 뭉개집니다.

### 해결책 — CPU에서 [0, 1]로 정규화

```typescript
// 전체 데이터의 시작과 스팬을 기준으로 정규화
const domainStart = timestamps[0];
const domainSpan  = timestamps[timestamps.length - 1] - domainStart;

// 버퍼에 올리기 전에 정규화
const xs = new Float32Array(
  timestamps.map(t => (t - domainStart) / domainSpan)
);
// 결과: 0.0 ~ 1.0 사이의 소수 → Float32로도 정밀도 충분

// 정규화 기준값을 WebGLState에 저장 (draw 시 사용)
wgl.domainStartMs = domainStart;
wgl.domainSpanMs  = domainSpan;
```

### 줌/팬 시 uniform 계산

xScale.domain()은 ms 단위 Date 객체를 유지합니다. draw 시에만 정규화값으로 변환해서 uniform에 넘깁니다.

```typescript
const xDomain  = cs.xScale.domain();
const viewStart = (xDomain[0].getTime() - wgl.domainStartMs) / wgl.domainSpanMs;
const viewEnd   = (xDomain[1].getTime() - wgl.domainStartMs) / wgl.domainSpanMs;

gl.uniform1f(wgl.uViewStart, viewStart);
gl.uniform1f(wgl.uViewEnd,   viewEnd);
```

D3 스케일, 커서, 툴팁 등 나머지 코드는 전부 ms 단위 그대로 사용합니다.  
변환은 GPU에 넘기는 그 순간에만 일어납니다.

### 멀티라인에서 정규화 기준

여러 라인이 같은 시간축을 공유하므로 **전체 시리즈를 합친 범위**를 기준으로 씁니다.

```typescript
const allTs      = seriesData.flatMap(s => s.timestamps);
const domainStart = Math.min(...allTs);
const domainSpan  = Math.max(...allTs) - domainStart;

wgl.domainStartMs = domainStart;
wgl.domainSpanMs  = domainSpan;
```

---

## D3 스케일 설계

### xScale — 시간축

```typescript
const xScale = d3.scaleTime()
  .domain([new Date(xMinMs), new Date(xMaxMs)]) // 입력: Date 객체 범위
  .range([0, innerW]);                            // 출력: 픽셀 범위

// 사용
xScale(new Date(timestamp)) // → 픽셀 x 좌표
xScale.invert(pixelX)       // → Date 객체 (커서 스냅핑에 사용)
xScale.domain([newStart, newEnd]) // 줌/팬 시 domain만 교체
```

### yScale — 값축

```typescript
const yScale = d3.scaleLinear()
  .domain([yMin, yMax]) // 입력: 데이터 값 범위
  .range([innerH, 0]);  // 출력: 픽셀 범위 (y축은 아래가 큰 값이므로 반전)

// 사용
yScale(value)        // → 픽셀 y 좌표
yScale.invert(pixelY) // → 데이터 값
```

**range가 [innerH, 0]인 이유:**  
픽셀 좌표는 위가 0, 아래가 커집니다. 데이터는 위가 큰 값이어야 하므로 반전합니다.

### innerW / innerH 계산

```typescript
const MARGIN = { top: 20, right: 20, bottom: 60, left: 50 };

const innerW = containerWidth - MARGIN.left - MARGIN.right;
const innerH = HEIGHT        - MARGIN.top  - MARGIN.bottom;
```

MARGIN은 축 레이블이 그려지는 공간입니다.  
- `bottom: 60` — x축 레이블(날짜)이 아래에 표시되므로 크게
- `left: 50` — y축 레이블(숫자)이 왼쪽에 표시되므로 적당히

### 초기 y범위 계산

데이터를 보기 전까지 yMin/yMax를 모르므로 데이터에서 자동 계산합니다.

```typescript
// lib/chart/math.ts의 initialYRangeFromValues 사용
const y0 = config.yMin !== undefined && config.yMax !== undefined
  ? { min: config.yMin, max: config.yMax }    // config에 고정값 있으면 사용
  : initialYRangeFromValues(allValues, 0.12); // 없으면 데이터 기반 자동 계산
                                              // 0.12 = 상하 12% 패딩
```

---

## 줌/팬 인터랙션 설계

### 휠 줌 — 마우스 위치 기준

마우스 커서 위치를 pivot으로 줌인/줌아웃합니다.

```typescript
const handleWheel = (e: WheelEvent) => {
  e.preventDefault(); // 페이지 스크롤 방지. passive: false 옵션 필수

  const ratio      = (e.clientX - rect.left - MARGIN.left) / innerW; // 0~1, 마우스 위치 비율
  const zoomFactor = e.deltaY > 0 ? 1.06 : 0.94; // 줌아웃 / 줌인
  const newRange   = range * zoomFactor;
  const newMin     = xMin + (range - newRange) * ratio; // pivot 유지

  // passive: false 없이는 e.preventDefault()가 동작하지 않음
  el.addEventListener("wheel", handleWheel, { passive: false });
};
```

### 드래그 팬 — x + y 동시

드래그 시작 시점의 도메인을 저장해두고, 드래그 델타만큼 이동합니다.

```typescript
// mousedown 시 저장
startXMin = cs.xScale.domain()[0].getTime();
startXMax = cs.xScale.domain()[1].getTime();
startYMin = cs.yScale.domain()[0];
startYMax = cs.yScale.domain()[1];

// mousemove 시 적용
const dt    = -(dx / innerW) * xSpan; // 픽셀 델타 → 시간 델타
const dyVal =  (dy / innerH) * ySpan; // 픽셀 델타 → 값 델타

cs.xScale.domain([new Date(startXMin + dt), new Date(startXMax + dt)]);
cs.yScale.domain([startYMin + dyVal, startYMax + dyVal]);
```

**mousemove는 window에 등록합니다.**  
컨테이너 밖으로 마우스가 나가도 드래그가 끊기지 않게 하기 위해서입니다.

```typescript
el.addEventListener("mousedown", handleMouseDown);
window.addEventListener("mousemove", handleMouseMove); // window
window.addEventListener("mouseup", handleMouseUp);     // window
```

### draw는 매 이벤트마다 동기 호출

줌/팬은 requestAnimationFrame 없이 이벤트 핸들러에서 바로 `drawChartNow`를 호출합니다.  
WebGL은 GPU가 처리하므로 매 이벤트마다 호출해도 성능 문제가 없습니다.

---

## 범위 제한 (clamp) 설계

### x축 clamp

데이터 범위 밖으로 나가지 않도록 제한합니다.

```typescript
// lib/chart/math.ts
export function clampViewRangeMs(
  start: number,
  end: number,
  domainStart?: number, // 넘기면 이 범위 안으로 제한
  domainEnd?: number    // 넘기지 않으면 제한 없음
): ViewRange
```

**반드시 domainStart, domainEnd를 넘겨야 합니다.**  
넘기지 않으면 데이터 밖으로 나가서 빈 화면이 됩니다.

```typescript
// useChartInteractions.ts에서 호출하는 방법
const ts          = params.dataRef.current.timestamps;
const domainStart = ts[0];
const domainEnd   = ts[ts.length - 1];

const clamped = clampViewRangeMs(newMin, newMax, domainStart, domainEnd);
```

### y축 clamp

드래그로 y축을 너무 많이 이동하면 데이터가 보이지 않게 됩니다.  
필요하면 `clampYRange`에 `hardMin`, `hardMax`를 넘겨 제한합니다.

```typescript
// 제한 없음 (현재 기본값)
const yc = clampYRange(newYMin, newYMax);

// 0~100 범위 고정
const yc = clampYRange(newYMin, newYMax, 0, 100);
```

---

## dynamic fetch 설계

### 언제 re-fetch하나

두 조건 중 하나라도 충족하면 re-fetch합니다.

```
조건: 뷰가 fetch된 구간 끝에서 10% 이내로 접근했을 때

fetchedRange: |←──────── fetch된 구간 ────────→|
                    10%↕               10%↕
              |← 이 안으로 뷰가 들어오면 re-fetch →|
```

```typescript
const leftMargin  = viewStart - fetched.start;
const rightMargin = fetched.end - viewEnd;
const threshold   = viewSpan * REFETCH_THRESHOLD; // 뷰 스팬의 10%

if (leftMargin < threshold || rightMargin < threshold) {
  // re-fetch
}
```

### fetch 구간 계산

뷰보다 앞뒤로 50% 여유를 포함해서 요청합니다.

```typescript
const padding   = viewSpan * FETCH_PADDING; // 뷰 스팬의 50%
const nextRange = {
  start: viewStart - padding,
  end:   viewEnd   + padding,
};
```

여유분을 두는 이유: 팬 시 즉시 빈 구간이 보이지 않도록 미리 데이터를 받아두기 위해서입니다.

### react-query queryKey 설계

fetchRange가 queryKey에 포함되어 있어서 범위가 바뀌면 자동으로 re-fetch합니다.

```typescript
useQuery({
  queryKey: ["chartDynamicData", dataUrl, fetchRange.start, fetchRange.end],
  //                                       ↑ 이 값이 바뀌면 자동 re-fetch
  queryFn: async () => {
    const url = new URL(dataUrl, window.location.origin);
    url.searchParams.set("start", String(fetchRange.start));
    url.searchParams.set("end",   String(fetchRange.end));
    return fetch(url).then(r => r.json());
  },
  staleTime: 30 * 1000, // 30초 동안 같은 구간 요청은 캐시 사용
});
```

### GPU 버퍼 재업로드

새 데이터가 도착하면 GPU 버퍼를 재업로드해야 합니다.  
동시에 domainStartMs, domainSpanMs도 새 데이터 기준으로 갱신합니다.

```typescript
// 새 데이터 도착 시
wgl.domainStartMs = newTimestamps[0];
wgl.domainSpanMs  = newTimestamps[newTimestamps.length - 1] - wgl.domainStartMs;
wgl.pointCount    = uploadLineData(wgl, newTimestamps, newValues);
drawChartNow(cs, innerW, innerH);
```

### 초기 fetch

마운트 시 파라미터 없이 API를 한 번 호출해서 전체 데이터를 받아옵니다.  
이후 줌/팬으로 구간이 확정되면 구간별 re-fetch로 전환합니다.

```typescript
// fetchRange 초기값 → start=0, end=0 → 서버가 전체 범위로 해석
const [fetchRange, setFetchRange] = useState({ start: 0, end: 0 });

// route.ts에서
const start = startParam && startParam !== "0" ? Number(startParam) : DATA_START_MS;
const end   = endParam   && endParam   !== "0" ? Number(endParam)   : DATA_END_MS;
```

---

## 타입 설계

### WebGLState

WebGL 관련 모든 핸들을 하나의 객체로 묶습니다.  
컴파일된 셰이더 프로그램, 버퍼, uniform 위치, attribute 위치를 포함합니다.

```typescript
interface WebGLState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;

  xBuf: WebGLBuffer;       // x좌표 버퍼
  yBuf: WebGLBuffer;       // y좌표 버퍼
  pointCount: number;      // 현재 버퍼에 올라간 점 수

  // uniform 위치 (getUniformLocation 결과 캐싱)
  uViewStart: WebGLUniformLocation;
  uViewEnd:   WebGLUniformLocation;
  uYMin:      WebGLUniformLocation;
  uYMax:      WebGLUniformLocation;
  uResolution: WebGLUniformLocation;
  uColor:      WebGLUniformLocation;

  // attribute 위치 (getAttribLocation 결과 캐싱)
  aX: number;
  aY: number;

  // Float32 정규화 기준값
  domainStartMs: number;
  domainSpanMs:  number;
}
```

uniform/attribute 위치를 매 드로우마다 `getUniformLocation`으로 다시 찾으면 느립니다.  
초기화 시 한 번만 찾아서 저장해두고 재사용합니다.

### ChartState

차트 인스턴스 전체 상태를 하나의 ref로 관리합니다.  
컴포넌트 리렌더링 없이 줌/팬이 동작하도록 ref로 관리하는 것이 핵심입니다.

```typescript
interface ChartState {
  xScale: d3.ScaleTime<number, number>;
  yScale: d3.ScaleLinear<number, number>;

  glCanvas:   HTMLCanvasElement;
  webgl:      WebGLState;

  axisCanvas: HTMLCanvasElement;
  axisCtx:    CanvasRenderingContext2D;

  cursorCanvas: HTMLCanvasElement;
  cursorCtx:    CanvasRenderingContext2D;

  cursorVisible: boolean;
  cursorX:       number;
  cursorY:       number;
  cursorValue:   number;
  cursorTime:    number;
}
```

**왜 ref로 관리하나?**  
줌/팬은 매 이벤트마다 xScale.domain()을 변경하고 다시 그립니다.  
이를 React state로 관리하면 매 이벤트마다 리렌더링이 발생해서 성능이 떨어집니다.  
ref는 값이 바뀌어도 리렌더링을 유발하지 않습니다.

---

## 처음부터 만들 때 순서

이 프로젝트와 동일한 구조를 처음부터 만들 때 권장하는 순서입니다.

```
1단계 — 타입 정의
  lib/chart/types.ts      WebGLState, ChartState 인터페이스
  lib/chart/chartConfig.ts LineChartConfig, LineSeries 인터페이스

2단계 — 수학 유틸
  lib/chart/math.ts       clampViewRangeMs, clampYRange, initialYRangeFromValues

3단계 — WebGL 코어
  lib/chart/webgl.ts      셰이더 소스, createProgram, initWebGLState
                          uploadLineData, drawWebGLLine

4단계 — 캔버스 스택
  components/chart/ChartCanvasStack.tsx   3개 캔버스 레이어 컴포넌트

5단계 — 레이어 훅
  hooks/chart/useWebGLLineLayer.ts        WebGL 초기화
  hooks/chart/useAxesLayer.ts             D3 축 그리기
  hooks/chart/useCursorLayer.ts           커서 그리기

6단계 — 인터랙션 훅
  hooks/chart/useChartInteractions.ts     휠줌, 드래그팬

7단계 — 데이터 훅
  hooks/useChartData.ts                   fetch, viewRange, dynamic 모드

8단계 — 차트 컴포넌트
  components/chart/WebGLLineChart.tsx     싱글라인
  components/chart/WebGlMultiLineChart.tsx 멀티라인

9단계 — config + 페이지
  config/charts/*.ts                      각 차트별 config
  app/*/page.tsx                          각 페이지

10단계 — dynamic API (필요 시)
  app/api/*/route.ts                      Next.js Route Handler
```

각 단계는 이전 단계에 의존합니다. 1~3단계를 완성하지 않으면 4단계 이후가 컴파일되지 않습니다.