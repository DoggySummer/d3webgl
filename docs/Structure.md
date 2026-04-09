# D3 + WebGL 차트 프로젝트 구조

## 개요

이 프로젝트는 **Next.js (App Router)** 기반으로, 대량의 시계열 데이터를 **WebGL**로 고성능 렌더링하고 **D3**로 축/줌/팬을 처리하는 인터랙티브 차트 애플리케이션입니다.

핵심 기술 스택:

- **Next.js** (App Router)
- **React**
- **D3.js** - 스케일(축 계산), 줌/팬 수학, 시간 포맷
- **WebGL** - GPU 기반 라인 렌더링 (수만~수십만 포인트)
- **Canvas 2D** - 축/격자/커서 오버레이
- **TanStack Query (react-query)** - 서버 데이터 캐싱
- **Tailwind CSS** - 스타일링

---

## 디렉터리 구조

```
app/
├── page.tsx                          # 싱글라인 차트 페이지 (온도)
├── layout.tsx                        # 루트 레이아웃 (QueryProvider 포함)
├── globals.css                       # Tailwind 글로벌 스타일
│
├── wind/
│   └── page.tsx                      # 멀티라인 차트 페이지 (풍속 비교)
│
├── humidity/
│   └── page.tsx                      # dynamic 싱글라인 차트 페이지 (습도)
│                                     # fetch 로그 패널 포함
│
├── api/
│   └── humidity/
│       └── route.ts                  # 구간 fetch API (mock 서버)
│                                     # ?start=...&end=... 파라미터로 구간 필터링
│
├── components/
│   ├── QueryProvider.tsx             # TanStack Query Provider 래퍼
│   └── chart/
│       ├── ChartCanvasStack.tsx      # 캔버스 3장 + 툴팁 DOM 스택
│       ├── WebGLLineChart.tsx        # 싱글라인 차트 컴포넌트
│       └── WebGlMultiLineChart.tsx   # 멀티라인 차트 컴포넌트 (라인 토글 포함)
│
├── config/charts/
│   ├── index.ts                      # config export 모음
│   ├── temperatureConfig.ts          # 싱글라인 예시 config (온도)
│   ├── windConfig.ts                 # 멀티라인 예시 config (풍속 비교)
│   └── humidityConfig.ts             # dynamic 싱글라인 예시 config (습도)
│
├── hooks/
│   ├── useChartData.ts               # 데이터 fetch + viewRange 관리
│   │                                 # static / dynamic 두 모드 지원
│   └── chart/
│       ├── useWebGLLineLayer.ts      # WebGL 초기화/버퍼 업로드
│       ├── useAxesLayer.ts           # 축/격자 draw API
│       ├── useCursorLayer.ts         # 커서(십자선+점) draw API
│       └── useChartInteractions.ts   # 휠 줌/드래그 팬 이벤트
│
└── lib/
    └── chart/
        ├── types.ts                  # WebGLState, ChartState 타입 정의
        ├── webgl.ts                  # 셰이더/프로그램/버퍼/드로우 (순수 함수)
        ├── chartConfig.ts            # LineChartConfig, LineSeries 타입 정의
        ├── overlay2d.ts              # 축/커서 Canvas 2D 렌더링 (순수 함수)
        └── math.ts                   # clampViewRangeMs, clampYRange 등 수학 유틸

public/
├── mock-weather.json                 # 온도 mock 데이터 (싱글라인)
└── mock-wind.json                    # 풍속 mock 데이터 (멀티라인)
                                      # 습도 데이터는 /api/humidity에서 동적 생성
```

---

## 데이터 흐름

### static 모드 (온도, 풍속)

```
[mock-weather.json / mock-wind.json]
       │
       ▼
useChartData({ lines, dynamic: false })
  react-query로 1회 fetch + 캐싱
  viewRange state 관리 (줌/팬 시 업데이트만, re-fetch 없음)
       │
       ▼
WebGLLineChart / WebGLMultiLineChart
  데이터 → 스케일 → 각 레이어로 전달
       │
       ├── useWebGLLineLayer    WebGL로 라인 그리기
       ├── useAxesLayer         Canvas 2D로 축/격자 그리기
       ├── useCursorLayer       Canvas 2D로 커서 십자선 그리기
       └── useChartInteractions 마우스 휠/드래그 이벤트 처리
```

### dynamic 모드 (습도)

```
useChartData({ lines, dynamic: true })
  초기: fetchRange = { start: 0, end: 0 } → 전체 범위 1회 fetch
       │
       ▼
줌/팬 발생 → updateViewRange(start, end) 호출 (150ms debounce)
       │
       ▼
shouldRefetch 판단
  뷰가 fetch 구간 끝에서 10% 이내 접근 시 → true
       │
       ▼ (re-fetch 필요 시)
fetchRange 재계산 (뷰 ±50% 여유 포함)
       │
       ▼
queryKey 변경 → react-query 자동 re-fetch
  GET /api/humidity?start=...&end=...
       │
       ▼
새 데이터 도착 → GPU 버퍼 재업로드 → drawChartNow()
```

---

## 레이어 구조 (캔버스 스택)

화면에 보이는 차트는 **4개의 레이어**가 겹쳐서 만들어집니다. `ChartCanvasStack` 컴포넌트가 이 DOM을 담당합니다.

```
┌──────────────────────────────┐  (맨 위)
│  tooltip div                 │  마우스 근처에 시간/값 표시
├──────────────────────────────┤
│  cursor canvas               │  십자선 + 점 (Canvas 2D)
├──────────────────────────────┤
│  axis canvas                 │  x/y축 + 격자선 + 라벨 (Canvas 2D)
├──────────────────────────────┤
│  WebGL canvas                │  라인 (GPU 렌더링)
└──────────────────────────────┘  (맨 아래)
```

WebGL canvas를 제외한 나머지 레이어는 `pointer-events: none`이라서, 마우스 이벤트는 컨테이너 div에서 직접 처리합니다.

---

## WebGL 렌더링 파이프라인 상세

### 왜 WebGL인가?

Canvas 2D의 `lineTo()`로 수십만 개의 점을 그리면 매 프레임 CPU가 모든 좌표를 순회해야 하므로 줌/팬 시 버벅입니다. WebGL은 데이터를 GPU 메모리(버퍼)에 **한 번 올려놓고**, 줌/팬 때는 **uniform 값(뷰 범위)만 바꿔서** GPU가 자동으로 좌표를 재계산하기 때문에 훨씬 빠릅니다.

### 파일별 역할

#### `app/lib/chart/types.ts` - 타입 정의

```typescript
interface WebGLState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  xBuf: WebGLBuffer;           // x좌표(정규화된 timestamp) GPU 버퍼
  yBuf: WebGLBuffer;           // y좌표(실제 값) GPU 버퍼
  pointCount: number;

  // uniform locations
  uViewStart: WebGLUniformLocation; // 현재 뷰 시작 (0~1 정규화값)
  uViewEnd:   WebGLUniformLocation; // 현재 뷰 끝   (0~1 정규화값)
  uYMin:      WebGLUniformLocation;
  uYMax:      WebGLUniformLocation;
  uResolution: WebGLUniformLocation;
  uColor:      WebGLUniformLocation;

  // attribute locations
  aX: number;
  aY: number;

  // Float32 정규화 기준값
  domainStartMs: number;
  domainSpanMs:  number;
}
```

#### `app/lib/chart/webgl.ts` - 셰이더와 GPU 통신

**1) `createVertexShaderSource(margin)` - 버텍스 셰이더 생성**

버텍스 셰이더는 각 데이터 포인트의 좌표를 화면 좌표로 변환하는 GPU 프로그램입니다.

변환 과정:

```
GPU 버퍼의 a_x (0~1 정규화값)
         │
         ▼  (1) 현재 뷰포트 내 상대 위치 계산
    nx = (a_x - u_viewStart) / (u_viewEnd - u_viewStart)
         │
         ▼  (2) margin을 고려한 픽셀 좌표로 변환
    px = marginLeft + nx * innerWidth
    py = marginTop + (1 - ny) * innerHeight
         │
         ▼  (3) WebGL NDC(-1 ~ +1)로 변환
    ndcX = (px / canvasWidth) * 2 - 1
    ndcY = 1 - (py / canvasHeight) * 2
```

줌/팬 시에는 `u_viewStart`, `u_viewEnd` uniform만 바꾸면 GPU가 자동으로 모든 점의 위치를 재계산합니다.

**2) `uploadLineData(wgl, timestamps, values)` - CPU → GPU 데이터 전송**

timestamp를 Float32로 올리기 전에 **CPU에서 [0, 1]로 정규화**합니다.

```
문제: Unix timestamp(ms)는 13자리 숫자
      Float32 유효 자릿수는 7자리 → 수십 초 오차 발생

해결: (timestamp - domainStart) / domainSpan → 0~1 범위
      0~1 소수는 Float32로도 정밀도 충분
```

```typescript
wgl.domainStartMs = timestamps[0];
wgl.domainSpanMs  = timestamps[n - 1] - timestamps[0];

const xs = new Float32Array(
  timestamps.map(t => (t - wgl.domainStartMs) / wgl.domainSpanMs)
);
```

이 업로드는 데이터가 바뀔 때만 실행됩니다. 줌/팬 때는 실행되지 않습니다.

**3) `drawWebGLLine(wgl, xScale, yScale, ...)` - 실제 드로우 콜**

매 프레임(줌/팬/리사이즈)마다 호출됩니다:

```
1. gl.viewport()    뷰포트 설정
2. gl.scissor()     margin 영역 클리핑 (선이 축 밖으로 삐져나가지 않게)
3. gl.uniform*()    u_viewStart/u_viewEnd/u_yMin/u_yMax를 셰이더에 전달
                    (ms → 0~1 정규화값으로 변환 후 전달)
4. gl.bindBuffer()  버퍼를 셰이더 attribute에 연결
5. gl.drawArrays(LINE_STRIP, 0, pointCount)  GPU가 선을 그림
```

#### `app/hooks/chart/useWebGLLineLayer.ts` - React와 WebGL 연결

이 훅이 WebGL의 생명주기를 관리합니다:

- 캔버스가 마운트되면 → WebGL 컨텍스트 생성 + 셰이더 컴파일
- 데이터가 바뀌면 → GPU 버퍼 재업로드
- 언마운트되면 → 정리

---

## 멀티라인 특이사항

`WebGLMultiLineChart`는 싱글라인과 구조가 거의 같지만 GPU 버퍼 관리 방식이 다릅니다.

```
싱글라인: useWebGLLineLayer 내부에서 버퍼 관리
멀티라인: lineBufsRef로 라인별 버퍼를 컴포넌트에서 직접 관리
```

라인별 버퍼를 미리 올려두고, 드로우 시 색상(uniform)과 알파값만 바꿔서 각 라인을 그립니다.  
꺼진 라인은 `DIMMED_ALPHA = 0.12`로 흐릿하게 표시합니다.

```typescript
// 토글 상태에 따라 알파값만 변경 (버퍼 재업로드 없음)
const alpha = active[i] ? 1.0 : DIMMED_ALPHA;
gl.uniform4f(cs.webgl.uColor, r, g, b, alpha);
gl.drawArrays(gl.LINE_STRIP, 0, buf.count);
```

언마운트 시 GPU 버퍼를 명시적으로 해제합니다:

```typescript
lineBufsRef.current.forEach(({ xBuf, yBuf }) => {
  wgl.gl.deleteBuffer(xBuf);
  wgl.gl.deleteBuffer(yBuf);
});
```

---

## Canvas 2D 오버레이 상세

WebGL은 "선 하나 빠르게 그리기"에 특화되어 있지만, 텍스트/눈금선 같은 UI 요소는 Canvas 2D API가 더 적합합니다.

**`drawAxes()`가 그리는 요소:**

```
┌─────────────────────────────────────┐
│  단위                               │
│   ┊          · · · · · · ·          │  ← 격자선 (점선)
│ 30├─ · · · · · · · · · · · ·        │
│   ┊                                 │
│ 20├─ · · · · · · · · · · · ·        │  ← y축 눈금 + 라벨
│   ┊                                 │
│ 10├─ · · · · · · · · · · · ·        │
│   ┊                                 │
│  0├──┬──────┬──────┬──────┬─        │
│     01/01  02/01  03/01  04/01      │  ← x축 눈금 + 시간 라벨
└─────────────────────────────────────┘
```

x축 라벨 포맷은 줌 레벨에 따라 자동 전환됩니다:

| 보이는 범위 | 포맷 | 예시 |
|------------|------|------|
| 1년 이상 | `%Y/%m` | `2024/03` |
| 30일~1년 | `%m/%d` | `03/15` |
| 1일~30일 | `%m/%d %H:%M` | `03/15 14:00` |
| 1일 이하 | `%H:%M` | `14:00` |

---

## 줌/팬 동작 원리

### `app/hooks/chart/useChartInteractions.ts`

**휠 줌:**

```
마우스 휠 이벤트
  │
  ├── deltaY > 0 → zoomFactor = 1.06 (축소)
  └── deltaY < 0 → zoomFactor = 0.94 (확대)
  │
  ▼
마우스 위치를 기준점(pivot)으로 x축 범위 재계산
clampViewRangeMs(newMin, newMax, domainStart, domainEnd)
  │
  ▼
xScale.domain() 업데이트 → drawChartNow() → GPU 재렌더
```

**드래그 팬:**

```
mousedown → 시작 도메인 (startXMin/Max, startYMin/Max) 기록
  │
mousemove → 이동량(dx, dy) 계산
  │         dx → x축 이동 (시간축)
  │         dy → y축 이동 (값축)
  │
  ▼
clampViewRangeMs(startXMin + dt, startXMax + dt, domainStart, domainEnd)
clampYRange(startYMin + dyVal, startYMax + dyVal)
xScale/yScale domain 업데이트 → drawChartNow()
  │
mouseup → 드래그 종료
```

### 범위 제한 (clamp)

`lib/chart/math.ts`의 `clampViewRangeMs`가 범위를 제한합니다.  
**반드시 `domainStart`, `domainEnd`를 넘겨야 효과가 있습니다.**

```typescript
// useChartInteractions.ts에서 호출
const ts          = params.dataRef.current.timestamps;
const domainStart = ts[0];
const domainEnd   = ts[ts.length - 1];

const clamped = clampViewRangeMs(newMin, newMax, domainStart, domainEnd);
```

`domainStart/domainEnd`를 넘기지 않으면 데이터 범위 밖으로 나가서 빈 화면이 됩니다.

---

## D3의 역할

이 프로젝트에서 D3는 **직접 DOM을 그리지 않습니다**. 대신 다음 기능만 사용합니다:

| D3 기능 | 용도 | 사용 위치 |
|---------|------|----------|
| `d3.scaleTime()` | timestamp → 픽셀 좌표 변환 | 차트 컴포넌트 |
| `d3.scaleLinear()` | 값 → 픽셀 좌표 변환 | 차트 컴포넌트 |
| `d3.timeFormat()` | 시간 포맷팅 (축 라벨, 툴팁) | overlay2d, config |
| `d3.bisector()` | 이진 탐색으로 가장 가까운 데이터 포인트 찾기 | 커서 로직 |
| `scale.ticks()` | 축 눈금 위치 자동 계산 | overlay2d |
| `scale.invert()` | 픽셀 좌표 → 데이터 값 역변환 | 커서 로직 |

---

## useChartData 모드 구분

```typescript
// static 모드 (기본값) — JSON 파일 1회 fetch
useChartData({ lines, dynamic: false })

// dynamic 모드 — 줌/팬 시 API 재호출
useChartData({ lines, dynamic: true })
```

| | static | dynamic |
|--|--------|---------|
| 데이터 소스 | `public/` JSON 파일 | API 엔드포인트 |
| fetch 시점 | 마운트 시 1회 | 초기 1회 + 구간 변경 시마다 |
| queryKey | `[dataUrl]` | `[dataUrl, fetchRange.start, fetchRange.end]` |
| re-fetch 조건 | 없음 | 뷰가 fetch 구간 끝 10% 이내 접근 시 |
| fetch 구간 | 전체 | 현재 뷰 ± 50% 여유 |

---

## 렌더링 성능 포인트

1. **React state 최소화**: 줌/팬마다 `setState`를 부르면 React 리렌더가 발생해서 느려짐. 대신 `chartStateRef`(mutable ref)로 스케일을 직접 수정하고 imperative하게 canvas에 다시 그림.

2. **GPU 버퍼 재사용**: 줌/팬 때 데이터를 다시 업로드하지 않음. uniform 값(뷰 범위)만 바꿔서 GPU가 좌표를 재계산.

3. **Float32 정규화**: timestamp를 [0, 1]로 정규화 후 GPU에 올림. 원시 ms값을 Float32로 변환하면 수십 초 오차 발생.

4. **레이어 분리**: WebGL 라인만 다시 그리거나, 축만 다시 그리거나, 커서만 다시 그릴 수 있음. 커서 이동 시 WebGL/축을 다시 그리지 않아도 됨.

5. **Scissor Test**: WebGL의 `gl.scissor()`로 margin 영역을 클리핑해서, 줌인 시 선이 축 밖으로 삐져나가지 않게 처리.

6. **멀티라인 버퍼 분리**: 라인별로 독립적인 GPU 버퍼를 유지. 토글 시 버퍼 재업로드 없이 alpha uniform만 변경.