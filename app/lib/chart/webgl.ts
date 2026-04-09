// lib/chart/webgl.ts

import type * as d3 from "d3";
import type { WebGLState } from "@/lib/chart/types";

export type ChartMargin = { top: number; right: number; bottom: number; left: number };

// ★ 변경: a_x는 이미 [0,1] 정규화값. u_viewStart/u_viewEnd로 뷰포트 범위만 받음
export function createVertexShaderSource(margin: ChartMargin): string {
  return `
  attribute float a_x;       // 0~1 정규화된 x (CPU에서 전처리)
  attribute float a_y;
  uniform float u_viewStart; // 현재 뷰 시작 (0~1)
  uniform float u_viewEnd;   // 현재 뷰 끝   (0~1)
  uniform float u_yMin;
  uniform float u_yMax;
  uniform vec2 u_resolution;
  void main() {
    float viewSpan = u_viewEnd - u_viewStart;
    float nx = (a_x - u_viewStart) / viewSpan;  // 뷰포트 내 위치로 변환
    float ny = (a_y - u_yMin) / (u_yMax - u_yMin);

    float marginL = float(${margin.left});
    float marginR = float(${margin.right});
    float marginT = float(${margin.top});
    float marginB = float(${margin.bottom});
    float innerW = u_resolution.x - marginL - marginR;
    float innerH = u_resolution.y - marginT - marginB;

    float px = marginL + nx * innerW;
    float py = marginT + (1.0 - ny) * innerH;

    float ndcX = (px / u_resolution.x) * 2.0 - 1.0;
    float ndcY = 1.0 - (py / u_resolution.y) * 2.0;
    gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);
  }
`;
}

export const FRAG_SRC = `
  precision mediump float;
  uniform vec4 u_color;
  void main() {
    gl_FragColor = u_color;
  }
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error("Shader compile error: " + gl.getShaderInfoLog(shader));
  }
  return shader;
}

export function createProgram(
  gl: WebGLRenderingContext,
  vertexSrc: string,
  fragmentSrc: string = FRAG_SRC
): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSrc));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("Program link error: " + gl.getProgramInfoLog(program));
  }
  return program;
}

export function initWebGLState(gl: WebGLRenderingContext, program: WebGLProgram): WebGLState {
  const xBuf = gl.createBuffer()!;
  const yBuf = gl.createBuffer()!;

  return {
    gl,
    program,
    xBuf,
    yBuf,
    pointCount: 0,
    // ★ 변경: uXMin/uXMax → uViewStart/uViewEnd
    uViewStart: gl.getUniformLocation(program, "u_viewStart")!,
    uViewEnd: gl.getUniformLocation(program, "u_viewEnd")!,
    uYMin: gl.getUniformLocation(program, "u_yMin")!,
    uYMax: gl.getUniformLocation(program, "u_yMax")!,
    uResolution: gl.getUniformLocation(program, "u_resolution")!,
    uColor: gl.getUniformLocation(program, "u_color")!,
    aX: gl.getAttribLocation(program, "a_x"),
    aY: gl.getAttribLocation(program, "a_y"),
    // ★ 전체 데이터 범위를 저장 (정규화 기준)
    domainStartMs: 0,
    domainSpanMs: 1,
  };
}

/**
 * ★ 변경: timestamps를 [0,1]로 정규화해서 Float32Array로 업로드
 * domainStart/domainSpan은 WebGLState에 저장해두고 draw 시 뷰포트 계산에 사용
 */
export function uploadLineData(
  wgl: WebGLState,
  timestamps: number[],
  values: number[]
): number {
  const { gl, xBuf, yBuf } = wgl;
  const n = timestamps.length;
  if (n === 0) return 0;

  // 전체 도메인 기준으로 정규화
  const domainStart = timestamps[0];
  const domainEnd = timestamps[n - 1];
  const domainSpan = domainEnd - domainStart || 1;

  wgl.domainStartMs = domainStart;
  wgl.domainSpanMs = domainSpan;

  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = (timestamps[i] - domainStart) / domainSpan; // ★ 0~1 정규화
    ys[i] = Number.isFinite(values[i]) ? values[i] : -9999;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, xBuf);
  gl.bufferData(gl.ARRAY_BUFFER, xs, gl.DYNAMIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, yBuf);
  gl.bufferData(gl.ARRAY_BUFFER, ys, gl.DYNAMIC_DRAW);

  return n;
}

export function drawWebGLLine(
  wgl: WebGLState,
  xScale: d3.ScaleTime<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  canvasW: number,
  canvasH: number,
  margin: ChartMargin,
  color: [number, number, number, number] = [0.145, 0.388, 0.922, 1.0]
) {
  const { gl, program } = wgl;

  const innerW = canvasW - margin.left - margin.right;
  const innerH = canvasH - margin.top - margin.bottom;

  gl.viewport(0, 0, canvasW, canvasH);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(margin.left, margin.bottom, innerW, innerH);

  gl.useProgram(program);

  const xDomain = xScale.domain();
  // ★ 변경: ms → 정규화값 [0,1] 으로 변환해서 uniform에 전달
  const viewStart = (xDomain[0].getTime() - wgl.domainStartMs) / wgl.domainSpanMs;
  const viewEnd = (xDomain[1].getTime() - wgl.domainStartMs) / wgl.domainSpanMs;
  const yDomain = yScale.domain();

  gl.uniform1f(wgl.uViewStart, viewStart);
  gl.uniform1f(wgl.uViewEnd, viewEnd);
  gl.uniform1f(wgl.uYMin, yDomain[0]);
  gl.uniform1f(wgl.uYMax, yDomain[1]);
  gl.uniform2f(wgl.uResolution, canvasW, canvasH);
  gl.uniform4f(wgl.uColor, ...color);

  gl.bindBuffer(gl.ARRAY_BUFFER, wgl.xBuf);
  gl.enableVertexAttribArray(wgl.aX);
  gl.vertexAttribPointer(wgl.aX, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, wgl.yBuf);
  gl.enableVertexAttribArray(wgl.aY);
  gl.vertexAttribPointer(wgl.aY, 1, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.LINE_STRIP, 0, wgl.pointCount);
  gl.disable(gl.SCISSOR_TEST);
}