// lib/chart/types.ts

import type * as d3 from "d3";

export interface WebGLState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  xBuf: WebGLBuffer;
  yBuf: WebGLBuffer;
  pointCount: number;
  // ★ 변경: uXMin/uXMax 제거 → uViewStart/uViewEnd
  uViewStart: WebGLUniformLocation;
  uViewEnd: WebGLUniformLocation;
  uYMin: WebGLUniformLocation;
  uYMax: WebGLUniformLocation;
  uResolution: WebGLUniformLocation;
  uColor: WebGLUniformLocation;
  aX: number;
  aY: number;
  // ★ 추가: CPU 정규화 기준값 (draw 시 뷰포트 계산용)
  domainStartMs: number;
  domainSpanMs: number;
}

export interface ChartState {
  xScale: d3.ScaleTime<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  glCanvas: HTMLCanvasElement;
  webgl: WebGLState;
  axisCanvas: HTMLCanvasElement;
  axisCtx: CanvasRenderingContext2D;
  cursorCanvas: HTMLCanvasElement;
  cursorCtx: CanvasRenderingContext2D;
  cursorVisible: boolean;
  cursorX: number;
  cursorY: number;
  cursorValue: number;
  cursorTime: number;
}