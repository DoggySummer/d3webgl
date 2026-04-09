/**
 * lib/chart/chartConfig.ts
 *
 * 타입 정의만 있는 파일입니다.
 * 이 파일을 수정할 때는 팀 전체가 논의 후 PR 리뷰를 받아야 합니다.
 * 타입이 바뀌면 모든 config 파일에 영향을 줍니다.
 */

/**
 * 차트 안에 그려지는 라인 1개의 설정
 * 멀티라인 차트는 이걸 배열로 여러 개 넘깁니다.
 */
export interface LineSeries {
  /** fetch할 API endpoint 또는 mock 파일 경로 */
  dataUrl: string;

  /** 데이터 객체에서 x값으로 쓸 키 (예: "timestamp") */
  xKey: string;

  /** 데이터 객체에서 y값으로 쓸 키 (예: "temperature") */
  yKey: string;

  /** 범례/툴팁에 표시될 라인 이름 (예: "온도", "속도") */
  label: string;

  /** 선 색상 hex (예: "#2563eb") */
  color: string;

  /** y값을 툴팁/축에 표시할 때 쓰는 포맷터 */
  formatY: (value: number) => string;
}

/**
 * WebGLLineChart 컴포넌트에 넘기는 전체 차트 설정
 */
export interface LineChartConfig {
  /** 차트 제목 (차트 상단에 표시) */
  title?: string;

  /**
   * 라인 목록
   * - 라인 1개: 일반 단일 라인 차트
   * - 라인 여러 개: 멀티라인 차트 (y축 단위가 같아야 합니다)
   */
  lines: LineSeries[];

  /** x축 타입 — 시간 데이터면 "time", 일반 숫자면 "linear" */
  xType: "time" | "linear";

  /** y축 단위 라벨 (예: "°C", "km/h", "hPa") */
  yLabel: string;

  /** y축 최솟값 고정. 없으면 데이터 기반으로 자동 계산 */
  yMin?: number;

  /** y축 최댓값 고정. 없으면 데이터 기반으로 자동 계산 */
  yMax?: number;

  /**
   * 툴팁 텍스트 포맷터
   * @param x - x값 (timestamp면 ms, linear면 숫자)
   * @param y - y값
   * @param label - 해당 라인의 label
   */
  formatTooltip: (x: number, y: number, label: string) => string;

  /** 차트 높이(px). 기본값 540 */
  height?: number;
}