import type * as d3 from "d3";

export interface WebGLState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  xBuf: WebGLBuffer;
  yBuf: WebGLBuffer;
  pointCount: number;
  // uniform locations
  uXMin: WebGLUniformLocation;
  uXMax: WebGLUniformLocation;
  uYMin: WebGLUniformLocation;
  uYMax: WebGLUniformLocation;
  uResolution: WebGLUniformLocation;
  uColor: WebGLUniformLocation;
  // attribute locations
  aX: number;
  aY: number;
}

export interface ChartState {
  xScale: d3.ScaleTime<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  // WebGL layer
  glCanvas: HTMLCanvasElement;
  webgl: WebGLState;
  // 2D overlay layer (축, 격자)
  axisCanvas: HTMLCanvasElement;
  axisCtx: CanvasRenderingContext2D;
  // 커서 overlay
  cursorCanvas: HTMLCanvasElement;
  cursorCtx: CanvasRenderingContext2D;
  cursorVisible: boolean;
  cursorX: number;
  cursorY: number;
  cursorTemp: number;
  cursorTime: number;
}

