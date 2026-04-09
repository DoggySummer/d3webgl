# D3 + WebGL 온도 차트 프로젝트 구조

## 개요

이 프로젝트는 **Next.js (App Router)** 기반으로, 대량의 시계열 온도 데이터를 **WebGL**로 고성능 렌더링하고 **D3**로 축/줌/팬을 처리하는 인터랙티브 차트 애플리케이션입니다.

핵심 기술 스택:

- **Next.js 16** (App Router, Server Actions)
- **React 19**
- **D3.js** - 스케일(축 계산), 줌/팬 수학, 시간 포맷
- **WebGL** - GPU 기반 라인 렌더링 (수만~수십만 포인트)
- **Canvas 2D** - 축/격자/커서 오버레이
- **TanStack Query (react-query)** - 서버 데이터 캐싱
- **Tailwind CSS** - 스타일링

---

## 디렉터리 구조

```
app/
├── page.tsx                          # 메인 페이지 (D3WebGLChart를 렌더)
├── layout.tsx                        # 루트 레이아웃 (QueryProvider 포함)
├── globals.css                       # Tailwind 글로벌 스타일
│
├── actions/
│   └── fetchTemperature.ts           # 서버 액션: mock 데이터 로드
│
├── components/
│   ├── D3WebGLChart.tsx              # 메인 차트 컴포넌트 (조립 역할)
│   ├── QueryProvider.tsx             # TanStack Query Provider 래퍼
│   └── chart/
│       └── ChartCanvasStack.tsx      # 캔버스 3장 + 툴팁 DOM 스택
│
├── hooks/
│   ├── useTemperatureData.ts         # 데이터 로드 + 뷰 범위 관리
│   └── chart/
│       ├── useWebGLLineLayer.ts      # WebGL 초기화/버퍼 업로드/draw
│       ├── useAxesLayer.ts           # 축/격자 draw API
│       ├── useCursorLayer.ts         # 커서(십자선+점) draw API
│       └── useChartInteractions.ts   # 휠 줌/드래그 팬 이벤트
│
├── lib/
│   └── chart/
│       ├── types.ts                  # WebGLState, ChartState 타입 정의
│       ├── webgl.ts                  # 셰이더/프로그램/버퍼/드로우 (순수 함수)
│       ├── overlay2d.ts              # 축/커서 Canvas 2D 렌더링 (순수 함수)
│       └── math.ts                   # clampYRange 등 수학 유틸
│
└── types/
    └── chartRef.ts                   # ChartHandle (외부에서 줌/팬 제어용)

public/
└── mock-weather.json                 # 시계열 온도 mock 데이터
```

---

## 데이터 흐름

```
[mock-weather.json]
       │
       ▼
fetchTemperature()          서버 액션: JSON 파일을 읽어서 반환
       │
       ▼
useTemperatureData()        react-query로 캐싱, viewRange 상태 관리
       │
       ▼
D3WebGLChart                메인 컴포넌트: 데이터 → 스케일 → 각 레이어로 전달
       │
       ├── useWebGLLineLayer    WebGL로 라인 그리기
       ├── useAxesLayer         Canvas 2D로 축/격자 그리기
       ├── useCursorLayer       Canvas 2D로 커서 십자선 그리기
       └── useChartInteractions 마우스 휠/드래그 이벤트 처리
```

---

## 레이어 구조 (캔버스 스택)

화면에 보이는 차트는 **4개의 레이어**가 겹쳐서 만들어집니다. `ChartCanvasStack` 컴포넌트가 이 DOM을 담당합니다.

```
┌──────────────────────────────┐  (맨 위)
│  tooltip div (z-index: 30)   │  마우스 근처에 시간/온도 표시
├──────────────────────────────┤
│  cursor canvas               │  십자선 + 파란 점 (Canvas 2D)
├──────────────────────────────┤
│  axis canvas                 │  x/y축 + 격자선 + 라벨 (Canvas 2D)
├──────────────────────────────┤
│  WebGL canvas                │  온도 라인 (GPU 렌더링)
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
  gl: WebGLRenderingContext;   // WebGL 컨텍스트
  program: WebGLProgram;       // 컴파일된 셰이더 프로그램
  xBuf: WebGLBuffer;           // x좌표(타임스탬프) GPU 버퍼
  yBuf: WebGLBuffer;           // y좌표(온도) GPU 버퍼
  pointCount: number;          // 데이터 포인트 수
  // uniform locations (셰이더에 값을 전달하는 "주소")
  uXMin, uXMax, uYMin, uYMax  // 현재 보이는 데이터 범위
  uResolution                  // 캔버스 크기 (px)
  uColor                       // 선 색상
  // attribute locations (버퍼 데이터를 셰이더에 연결하는 "주소")
  aX, aY                       // x, y 데이터 입력
}
```

#### `app/lib/chart/webgl.ts` - 셰이더와 GPU 통신

이 파일이 WebGL의 핵심입니다. 4개의 주요 함수가 있습니다.

**1) `createVertexShaderSource(margin)` - 버텍스 셰이더 생성**

버텍스 셰이더는 **각 데이터 포인트의 좌표를 화면 좌표로 변환**하는 GPU 프로그램입니다. GLSL(OpenGL Shading Language)로 작성됩니다.

변환 과정:

```
데이터 좌표 (timestamp, temperature)
         │
         ▼  (1) 0~1로 정규화
    nx = (x - xMin) / (xMax - xMin)
    ny = (y - yMin) / (yMax - yMin)
         │
         ▼  (2) margin을 고려한 픽셀 좌표로 변환
    px = marginLeft + nx * innerWidth
    py = marginTop + (1 - ny) * innerHeight
         │
         ▼  (3) WebGL NDC(-1 ~ +1)로 변환
    ndcX = (px / canvasWidth) * 2 - 1
    ndcY = 1 - (py / canvasHeight) * 2
```

이 계산이 **GPU에서 모든 포인트에 대해 병렬로** 실행됩니다. 줌/팬 시에는 `xMin/xMax/yMin/yMax` uniform만 바꾸면 GPU가 자동으로 모든 점의 위치를 재계산합니다.

**2) `createProgram(gl, vertexSrc)` - 셰이더 컴파일 & 링크**

```
vertexSrc (GLSL 텍스트)  ──컴파일──▶  vertex shader
FRAG_SRC  (GLSL 텍스트)  ──컴파일──▶  fragment shader
                                         │
                                    ──링크──▶  WebGLProgram
```

- vertex shader: 각 점의 **위치**를 계산
- fragment shader: 각 픽셀의 **색상**을 결정 (여기서는 단색 파란색)

**3) `uploadLineData(wgl, timestamps, temperatures)` - CPU → GPU 데이터 전송**

```
JavaScript 배열 (number[])
         │
         ▼  Float32Array로 변환 (GPU가 이해하는 형식)
    xs = new Float32Array(timestamps)
    ys = new Float32Array(temperatures)
         │
         ▼  gl.bufferData()로 GPU 메모리에 업로드
    xBuf ← xs
    yBuf ← ys
```

이 업로드는 데이터가 바뀔 때만 1번 실행됩니다. 줌/팬 때는 실행되지 않습니다.

**4) `drawWebGLLine(wgl, xScale, yScale, ...)` - 실제 드로우 콜**

매 프레임(줌/팬/리사이즈)마다 호출됩니다:

```
1. gl.viewport() — 뷰포트 설정
2. gl.scissor()  — margin 영역 클리핑 (선이 축 밖으로 삐져나가지 않게)
3. gl.uniform*() — 현재 xMin/xMax/yMin/yMax를 셰이더에 전달
4. gl.bindBuffer() + gl.vertexAttribPointer() — 버퍼를 셰이더 attribute에 연결
5. gl.drawArrays(LINE_STRIP, 0, pointCount) — GPU가 선을 그림
```

`LINE_STRIP`은 모든 점을 순서대로 이은 연속 선을 의미합니다.

#### `app/hooks/chart/useWebGLLineLayer.ts` - React와 WebGL 연결

이 훅이 WebGL의 **생명주기**를 관리합니다:

- 캔버스가 마운트되면 → WebGL 컨텍스트 생성 + 셰이더 컴파일
- 데이터가 바뀌면 → GPU 버퍼 재업로드
- 언마운트되면 → 정리

---

## Canvas 2D 오버레이 상세

### `app/lib/chart/overlay2d.ts`

WebGL은 "선 하나 빠르게 그리기"에 특화되어 있지만, 텍스트/눈금선 같은 UI 요소는 Canvas 2D API가 더 적합합니다. 그래서 축/격자/커서는 별도의 Canvas 2D 레이어에 그립니다.

**`drawAxes()`가 그리는 요소:**

```
┌─────────────────────────────────────┐
│  °C                                 │
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

**`drawCursor()`가 그리는 요소:**

마우스가 차트 영역 위에 있을 때 표시됩니다:

- 수직/수평 점선 (십자선)
- 가장 가까운 데이터 포인트 위에 파란 원

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
마우스 위치를 기준으로 x축 범위를 재계산
  │
  ▼
xScale.domain() 업데이트 → drawChartNow() → GPU가 재렌더
```

줌의 핵심은 **마우스 포인터 위치를 기준점으로** 확대/축소한다는 것입니다. 마우스가 차트 왼쪽에 있으면 왼쪽 기준으로, 오른쪽에 있으면 오른쪽 기준으로 줌됩니다.

**드래그 팬:**

```
mousedown → 시작점 (startX, startY) 기록
  │
mousemove → 이동량(dx, dy) 계산
  │         dx → x축 이동 (시간축)
  │         dy → y축 이동 (온도축)
  │
  ▼
xScale/yScale domain 업데이트 → drawChartNow()
  │
mouseup → 드래그 종료
```

---

## D3의 역할

이 프로젝트에서 D3는 **직접 DOM을 그리지 않습니다**. 대신 다음 기능만 사용합니다:

| D3 기능 | 용도 | 사용 위치 |
|---------|------|----------|
| `d3.scaleTime()` | 타임스탬프 → 픽셀 좌표 변환 | D3WebGLChart |
| `d3.scaleLinear()` | 온도 → 픽셀 좌표 변환 | D3WebGLChart |
| `d3.timeFormat()` | 시간 포맷팅 (축 라벨, 툴팁) | overlay2d, cursor |
| `d3.bisector()` | 이진 탐색으로 가장 가까운 데이터 포인트 찾기 | cursor 로직 |
| `scale.ticks()` | 축 눈금 위치 자동 계산 | overlay2d |
| `scale.invert()` | 픽셀 좌표 → 데이터 값 역변환 | cursor 로직 |

---

## 주요 컴포넌트/훅 요약

| 파일 | 책임 | 줄 수 |
|------|------|-------|
| `D3WebGLChart.tsx` | 데이터/스케일/훅 조립, 차트 생명주기 관리 | ~340 |
| `ChartCanvasStack.tsx` | 캔버스 3장 + 툴팁 div DOM 스택 | ~64 |
| `useWebGLLineLayer.ts` | WebGL 초기화/정리, 버퍼 업로드, draw API | ~73 |
| `useChartInteractions.ts` | 휠 줌, 드래그 팬 이벤트 바인딩 | ~170 |
| `useAxesLayer.ts` | 축/격자 draw 래퍼 | ~28 |
| `useCursorLayer.ts` | 커서 draw 래퍼 | ~26 |
| `useTemperatureData.ts` | 데이터 로드 (react-query), 뷰 범위 관리 | ~98 |
| `webgl.ts` | 셰이더/프로그램/버퍼/드로우 순수 함수 | ~161 |
| `overlay2d.ts` | 축/커서 Canvas 2D 렌더링 순수 함수 | ~147 |
| `math.ts` | Y축 범위 clamp, 초기 범위 계산, 포인트 카운트 | ~47 |
| `types.ts` | WebGLState, ChartState 인터페이스 | ~40 |

---

## 렌더링 성능 포인트

1. **React state 최소화**: 줌/팬마다 `setState`를 부르면 React 리렌더가 발생해서 느려짐. 대신 `chartStateRef`(mutable ref)로 스케일을 직접 수정하고, imperative하게 canvas에 다시 그림.

2. **GPU 버퍼 재사용**: 줌/팬 때 데이터를 다시 업로드하지 않음. uniform 값(뷰 범위)만 바꿔서 GPU가 좌표를 재계산.

3. **레이어 분리**: WebGL 라인만 다시 그리거나, 축만 다시 그리거나, 커서만 다시 그릴 수 있음. 커서 이동 시 WebGL/축을 다시 그리지 않아도 됨.

4. **Scissor Test**: WebGL의 `gl.scissor()`로 margin 영역을 클리핑해서, 줌인 시 선이 축 밖으로 삐져나가지 않게 처리.
