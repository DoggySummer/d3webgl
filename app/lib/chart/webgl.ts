import type * as d3 from "d3";
import type { WebGLState } from "@/lib/chart/types";

export type ChartMargin = { top: number; right: number; bottom: number; left: number };

// GLSL 셰이더 소스 생성, GPU가 좌표 변환하는 코드
export function createVertexShaderSource(margin: ChartMargin): string {
  return `
  attribute float a_x;
  attribute float a_y;
  uniform float u_xMin;
  uniform float u_xMax;
  uniform float u_yMin;
  uniform float u_yMax;
  // MARGIN을 NDC로 환산하기 위한 캔버스 크기
  uniform vec2 u_resolution; // (width, height) in px
  void main() {
    // 데이터 좌표 → 0~1 정규화
    float nx = (a_x - u_xMin) / (u_xMax - u_xMin);
    float ny = (a_y - u_yMin) / (u_yMax - u_yMin);
    // innerW / innerH 를 px 기준으로 계산
    float marginL = float(${margin.left});
    float marginR = float(${margin.right});
    float marginT = float(${margin.top});
    float marginB = float(${margin.bottom});
    float innerW = u_resolution.x - marginL - marginR;
    float innerH = u_resolution.y - marginT - marginB;
    // 픽셀 좌표 (원점 좌상단)
    float px = marginL + nx * innerW;
    float py = marginT + (1.0 - ny) * innerH;
    // NDC 변환 (WebGL 원점 좌하단)
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
    uXMin: gl.getUniformLocation(program, "u_xMin")!,
    uXMax: gl.getUniformLocation(program, "u_xMax")!,
    uYMin: gl.getUniformLocation(program, "u_yMin")!,
    uYMax: gl.getUniformLocation(program, "u_yMax")!,
    uResolution: gl.getUniformLocation(program, "u_resolution")!,
    uColor: gl.getUniformLocation(program, "u_color")!,
    aX: gl.getAttribLocation(program, "a_x"),
    aY: gl.getAttribLocation(program, "a_y"),
  };
}

export function uploadLineData(
  wgl: WebGLState,
  timestamps: number[],
  temperatures: number[]
): number {
  const { gl, xBuf, yBuf } = wgl;
  const n = timestamps.length;

  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = timestamps[i];
    ys[i] = Number.isFinite(temperatures[i]) ? temperatures[i] : -9999;
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
  margin: ChartMargin
) {
  const { gl, program } = wgl;

  const innerW = canvasW - margin.left - margin.right;
  const innerH = canvasH - margin.top - margin.bottom;

  gl.viewport(0, 0, canvasW, canvasH);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // scissor test — MARGIN 영역 클립 (WebGL y원점은 좌하단)
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(margin.left, margin.bottom, innerW, innerH);

  gl.useProgram(program);

  const xDomain = xScale.domain();
  const yDomain = yScale.domain();

  gl.uniform1f(wgl.uXMin, xDomain[0].getTime());
  gl.uniform1f(wgl.uXMax, xDomain[1].getTime());
  gl.uniform1f(wgl.uYMin, yDomain[0]);
  gl.uniform1f(wgl.uYMax, yDomain[1]);
  gl.uniform2f(wgl.uResolution, canvasW, canvasH);
  gl.uniform4f(wgl.uColor, 0.145, 0.388, 0.922, 1.0); // #2563eb

  gl.bindBuffer(gl.ARRAY_BUFFER, wgl.xBuf);
  gl.enableVertexAttribArray(wgl.aX);
  gl.vertexAttribPointer(wgl.aX, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, wgl.yBuf);
  gl.enableVertexAttribArray(wgl.aY);
  gl.vertexAttribPointer(wgl.aY, 1, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.LINE_STRIP, 0, wgl.pointCount);
  gl.disable(gl.SCISSOR_TEST);
}

