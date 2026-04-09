import { useEffect, useRef, useState } from "react";
import type * as d3 from "d3";
import type { WebGLState } from "@/lib/chart/types";
import type { ChartMargin } from "@/lib/chart/webgl";
import {
  createProgram,
  createVertexShaderSource,
  drawWebGLLine,
  initWebGLState,
  uploadLineData,
} from "@/lib/chart/webgl";

export function useWebGLLineLayer(params: {
  canvas: HTMLCanvasElement | null;
  margin: ChartMargin;
  timestamps: number[];
  temperatures: number[];
}) {
  const wglRef = useRef<WebGLState | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const canvas = params.canvas;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { antialias: true, alpha: true });
    if (!gl) throw new Error("WebGL not supported");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const vertexSrc = createVertexShaderSource(params.margin);
    const program = createProgram(gl, vertexSrc);
    const wgl = initWebGLState(gl, program);
    wgl.pointCount = uploadLineData(wgl, params.timestamps, params.temperatures);
    wglRef.current = wgl;
    setIsReady(true);

    return () => {
      wglRef.current = null;
      setIsReady(false);
      // NOTE: webgl resource cleanup is best-effort; contexts are typically GC'd.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.canvas]);

  // 데이터가 나중에 로드/갱신되는 경우(캔버스는 이미 준비된 상태)에도 버퍼를 다시 업로드
  useEffect(() => {
    const wgl = wglRef.current;
    if (!wgl) return;
    wgl.pointCount = uploadLineData(wgl, params.timestamps, params.temperatures);
  }, [params.timestamps, params.temperatures]);

  const upload = (timestamps: number[], temperatures: number[]) => {
    const wgl = wglRef.current;
    if (!wgl) return 0;
    wgl.pointCount = uploadLineData(wgl, timestamps, temperatures);
    return wgl.pointCount;
  };

  const draw = (
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) => {
    const wgl = wglRef.current;
    const canvas = params.canvas;
    if (!wgl || !canvas) return;
    drawWebGLLine(wgl, xScale, yScale, canvas.width, canvas.height, params.margin);
  };

  return { wglRef, upload, draw, isReady };
}

