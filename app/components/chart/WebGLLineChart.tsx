"use client";

/**
 * components/WebGLLineChart.tsx
 *
 * config를 받아서 렌더링하는 범용 라인 차트 컴포넌트입니다.
 * 단일 라인 / 멀티라인 모두 지원합니다.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import * as d3 from "d3";
import { clampViewRangeMs } from "@/hooks/useTemperatureData";
import type { LineChartConfig } from "@/lib/chart/chartConfig";
import type { ChartState } from "@/lib/chart/types";
import { drawWebGLLine, uploadLineData } from "@/lib/chart/webgl";
import { useAxesLayer } from "@/hooks/chart/useAxesLayer";
import { useCursorLayer } from "@/hooks/chart/useCursorLayer";
import { useChartInteractions } from "@/hooks/chart/useChartInteractions";
import { useWebGLLineLayer } from "@/hooks/chart/useWebGLLineLayer";
import { ChartCanvasStack } from "@/components/chart/ChartCanvasStack";
import { useChartData } from "@/hooks/useChartData";
import { initialYRangeFromTemps } from "@/lib/chart/math";

const MARGIN = { top: 20, right: 20, bottom: 60, left: 50 };

interface WebGLLineChartProps {
  config: LineChartConfig;
}

export function WebGLLineChart({ config }: WebGLLineChartProps) {
  const HEIGHT = config.height ?? 540;

  // ── Refs ──────────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null);
  const chartStateRef = useRef<ChartState | null>(null);
  // 멀티라인: 라인별 데이터를 배열로 보관
  const seriesDataRef = useRef<{ timestamps: number[]; values: number[] }[]>([]);
  // 하위 호환: 단일 라인 / 인터랙션 훅용
  const dataRef = useRef<{ timestamps: number[]; values: number[] }>({
    timestamps: [],
    values: [],
  });
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  // ── Canvas state ──────────────────────────────────────────────────────

  const [glCanvas, setGlCanvas] = useState<HTMLCanvasElement | null>(null);
  const [axisCanvas, setAxisCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cursorCanvas, setCursorCanvas] = useState<HTMLCanvasElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // ── 레이어 훅 ─────────────────────────────────────────────────────────

  const { drawAxes } = useAxesLayer({ margin: MARGIN });
  const { drawCursor } = useCursorLayer({ margin: MARGIN });

  // ── 데이터 로드 ───────────────────────────────────────────────────────

  const { seriesData, data, isLoading, updateViewRange, viewRange } =
    useChartData({ lines: config.lines });

  // ── 내부 치수 ─────────────────────────────────────────────────────────

  const getInnerDims = useCallback(
    () => ({
      innerW: containerWidth - MARGIN.left - MARGIN.right,
      innerH: HEIGHT - MARGIN.top - MARGIN.bottom,
    }),
    [containerWidth, HEIGHT]
  );

  // ── 차트 그리기 ───────────────────────────────────────────────────────
  // 멀티라인: 각 라인마다 uploadLineData + drawWebGLLine 호출

  const drawChartNow = useCallback(
    (cs: ChartState, innerW: number, innerH: number) => {
      const series = seriesDataRef.current;

      if (series.length <= 1) {
        // 단일 라인
        drawWebGLLine(
          cs.webgl,
          cs.xScale,
          cs.yScale,
          cs.glCanvas.width,
          cs.glCanvas.height,
          MARGIN
        );
      } else {
        // 멀티라인: 라인마다 버퍼 업로드 + 색상 변경 + draw
        series.forEach((s, i) => {
          const line = config.lines[i];
          if (!line) return;
          const { gl, program } = cs.webgl;

          const r = parseInt(line.color.slice(1, 3), 16) / 255;
          const g = parseInt(line.color.slice(3, 5), 16) / 255;
          const b = parseInt(line.color.slice(5, 7), 16) / 255;

          const innerW = cs.glCanvas.width - MARGIN.left - MARGIN.right;
          const innerH = cs.glCanvas.height - MARGIN.top - MARGIN.bottom;
          const xDomain = cs.xScale.domain();
          const yDomain = cs.yScale.domain();

          // i === 0일 때만 화면 초기화
          if (i === 0) {
            gl.viewport(0, 0, cs.glCanvas.width, cs.glCanvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }

          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(MARGIN.left, MARGIN.bottom, innerW, innerH);
          gl.useProgram(program);

          gl.uniform1f(cs.webgl.uXMin, xDomain[0].getTime());
          gl.uniform1f(cs.webgl.uXMax, xDomain[1].getTime());
          gl.uniform1f(cs.webgl.uYMin, yDomain[0]);
          gl.uniform1f(cs.webgl.uYMax, yDomain[1]);
          gl.uniform2f(cs.webgl.uResolution, cs.glCanvas.width, cs.glCanvas.height);
          gl.uniform4f(cs.webgl.uColor, r, g, b, 1.0);  // ← 라인별 색상

          cs.webgl.pointCount = uploadLineData(cs.webgl, s.timestamps, s.values);

          gl.bindBuffer(gl.ARRAY_BUFFER, cs.webgl.xBuf);
          gl.enableVertexAttribArray(cs.webgl.aX);
          gl.vertexAttribPointer(cs.webgl.aX, 1, gl.FLOAT, false, 0, 0);

          gl.bindBuffer(gl.ARRAY_BUFFER, cs.webgl.yBuf);
          gl.enableVertexAttribArray(cs.webgl.aY);
          gl.vertexAttribPointer(cs.webgl.aY, 1, gl.FLOAT, false, 0, 0);

          gl.drawArrays(gl.LINE_STRIP, 0, cs.webgl.pointCount);
          gl.disable(gl.SCISSOR_TEST);
        });
      }

      drawAxes({
        ctx: cs.axisCtx,
        canvas: cs.axisCanvas,
        xScale: cs.xScale,
        yScale: cs.yScale,
        innerW,
        innerH,
      });
    },
    [drawAxes, config.lines]
  );

  // ── WebGL 초기화 ──────────────────────────────────────────────────────

  const { wglRef, isReady: isWebGLReady } = useWebGLLineLayer({
    canvas: glCanvas,
    margin: MARGIN,
    timestamps: data?.timestamps ?? [],
    temperatures: data?.values ?? [],
  });

  // ── 인터랙션 ──────────────────────────────────────────────────────────

  useChartInteractions({
    margin: MARGIN,
    height: HEIGHT,
    containerRef,
    chartStateRef,
    dataRef,
    getInnerDims,
    updateViewRange,
    drawChartNow,
    tooltipRef,
    containerWidth,
  });

  // ── ResizeObserver ────────────────────────────────────────────────────

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

  // ── 언마운트 정리 ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      chartStateRef.current = null;
      tooltipRef.current = null;
    };
  }, []);

  // ── 차트 인스턴스 1회 생성 ────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || containerWidth === 0) return;
    if (chartStateRef.current) return;
    if (!seriesData || seriesData.length === 0) return;
    if (seriesData[0].timestamps.length === 0) return;
    if (!glCanvas || !axisCanvas || !cursorCanvas) return;
    const wgl = wglRef.current;
    if (!isWebGLReady || !wgl) return;

    const { innerW, innerH } = getInnerDims();

    // 전체 시리즈에서 x 범위 계산
    const allTimestamps = seriesData.flatMap((s) => s.timestamps);
    const xExtent = d3.extent(allTimestamps) as [number, number];
    const { start: xMinMs, end: xMaxMs } = clampViewRangeMs(xExtent[0], xExtent[1]);

    // 전체 시리즈에서 y 범위 계산
    const allValues = seriesData.flatMap((s) => s.values);
    const y0 = config.yMin !== undefined && config.yMax !== undefined
      ? { min: config.yMin, max: config.yMax }
      : initialYRangeFromTemps(allValues);

    const xScale = d3.scaleTime()
      .domain([new Date(xMinMs), new Date(xMaxMs)])
      .range([0, innerW]);
    const yScale = d3.scaleLinear()
      .domain([y0.min, y0.max])
      .range([innerH, 0]);

    const axisCtx = axisCanvas.getContext("2d")!;
    const cursorCtx = cursorCanvas.getContext("2d")!;

    // seriesDataRef 초기화
    seriesDataRef.current = seriesData.map((s) => ({
      timestamps: s.timestamps,
      values: s.values,
    }));

    // dataRef는 첫 번째 라인 기준 (인터랙션 훅용)
    dataRef.current = {
      timestamps: seriesData[0].timestamps,
      values: seriesData[0].values,
    };

    wgl.pointCount = uploadLineData(wgl, seriesData[0].timestamps, seriesData[0].values);

    const cs: ChartState = {
      xScale,
      yScale,
      glCanvas,
      webgl: wgl,
      axisCanvas,
      axisCtx,
      cursorCanvas,
      cursorCtx,
      cursorVisible: false,
      cursorX: 0,
      cursorY: 0,
      cursorTemp: 0,
      cursorTime: 0,
    };

    chartStateRef.current = cs;
    drawChartNow(cs, innerW, innerH);
  }, [
    axisCanvas, containerWidth, cursorCanvas, seriesData,
    config, drawChartNow, getInnerDims, glCanvas, isWebGLReady, viewRange, wglRef,
  ]);

  // ── 데이터 변경 시 업데이트 ───────────────────────────────────────────

  useEffect(() => {
    const cs = chartStateRef.current;
    if (!cs || !seriesData || seriesData.length === 0) return;

    const { innerW, innerH } = getInnerDims();

    seriesDataRef.current = seriesData.map((s) => ({
      timestamps: s.timestamps,
      values: s.values,
    }));
    dataRef.current = {
      timestamps: seriesData[0].timestamps,
      values: seriesData[0].values,
    };

    drawChartNow(cs, innerW, innerH);
  }, [seriesData, getInnerDims, drawChartNow]);

  // ── 리사이즈 ──────────────────────────────────────────────────────────

  useEffect(() => {
    const cs = chartStateRef.current;
    if (!cs || containerWidth === 0) return;
    const { innerW, innerH } = getInnerDims();
    cs.xScale.range([0, innerW]);
    drawChartNow(cs, innerW, innerH);
  }, [containerWidth, getInnerDims, drawChartNow]);

  // ── 커서 ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      const cs = chartStateRef.current;
      if (!cs || dataRef.current.timestamps.length === 0) return;

      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left - MARGIN.left;
      const my = e.clientY - rect.top - MARGIN.top;
      const { innerW, innerH } = getInnerDims();

      if (mx < 0 || mx > innerW || my < 0 || my > innerH) {
        cs.cursorVisible = false;
        drawCursor({
          ctx: cs.cursorCtx,
          canvas: cs.cursorCanvas,
          cursorVisible: false,
          cursorX: cs.cursorX,
          cursorY: cs.cursorY,
          innerW,
          innerH,
        });
        if (tooltipRef.current)
          tooltipRef.current.style.transform = "translate(-9999px, -9999px)";
        return;
      }

      const mouseTime = cs.xScale.invert(mx).getTime();
      const ts = dataRef.current.timestamps;
      const bisect = d3.bisector((d: number) => d).left;
      let idx = bisect(ts, mouseTime);
      if (idx >= ts.length) idx = ts.length - 1;
      if (idx > 0) {
        const d0 = mouseTime - ts[idx - 1];
        const d1 = ts[idx] - mouseTime;
        if (d0 < d1) idx--;
      }

      const pointTime = ts[idx];

      // 멀티라인: 해당 인덱스의 모든 라인 값을 툴팁에 표시
      const series = seriesDataRef.current;
      const firstVal = series[0]?.values[idx];
      if (!Number.isFinite(firstVal)) return;

      const px = cs.xScale(new Date(pointTime));
      const py = cs.yScale(firstVal);

      cs.cursorVisible = true;
      cs.cursorX = px;
      cs.cursorY = py;
      cs.cursorTemp = firstVal;
      cs.cursorTime = pointTime;

      drawCursor({
        ctx: cs.cursorCtx,
        canvas: cs.cursorCanvas,
        cursorVisible: true,
        cursorX: px,
        cursorY: py,
        innerW,
        innerH,
      });

      const tip = tooltipRef.current;
      if (tip) {
        const dateStr = d3.timeFormat("%Y-%m-%d %H:%M")(new Date(pointTime));
        // 멀티라인: 각 라인 값을 줄바꿈으로 표시
        const lines = series
          .map((s, i) => {
            const line = config.lines[i];
            if (!line) return "";
            return config.formatTooltip(pointTime, s.values[idx], line.label);
          })
          .filter(Boolean)
          .join("\n");

        tip.style.whiteSpace = "pre";
        tip.textContent = series.length > 1
          ? `${dateStr}\n${lines}`
          : lines;

        const offsetX = 12, offsetY = 12;
        const tipW = tip.offsetWidth || 180;
        const tipH = tip.offsetHeight || 48;
        const cw = containerRef.current?.clientWidth ?? containerWidth;
        const ch = containerRef.current?.clientHeight ?? HEIGHT;
        const rawLeft = MARGIN.left + mx + offsetX;
        const rawTop = MARGIN.top + my - offsetY - tipH;
        const left = Math.max(6, Math.min(rawLeft, cw - tipW - 6));
        const top = Math.max(6, Math.min(rawTop, ch - tipH - 6));
        tip.style.transform = `translate(${left}px, ${top}px)`;
      }
    };

    const handleMouseLeave = () => {
      const cs = chartStateRef.current;
      if (!cs) return;
      cs.cursorVisible = false;
      const { innerW, innerH } = getInnerDims();
      drawCursor({
        ctx: cs.cursorCtx,
        canvas: cs.cursorCanvas,
        cursorVisible: false,
        cursorX: cs.cursorX,
        cursorY: cs.cursorY,
        innerW,
        innerH,
      });
      if (tooltipRef.current)
        tooltipRef.current.style.transform = "translate(-9999px, -9999px)";
    };

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [config, getInnerDims, drawCursor, containerWidth, HEIGHT]);

  // ── 렌더 ──────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full min-w-0 max-w-full overflow-hidden">
      {config.title && (
        <h2 className="text-sm font-medium text-gray-500 px-1 mb-1">
          {config.title}
        </h2>
      )}
      {isLoading && !seriesData && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-20">
          <span className="text-sm text-gray-400">Loading...</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full min-w-0 max-w-full cursor-grab active:cursor-grabbing"
        style={{ height: HEIGHT }}
      >
        <ChartCanvasStack
          className="w-full"
          width={containerWidth}
          height={HEIGHT}
          glCanvasRef={(n) => setGlCanvas(n)}
          axisCanvasRef={(n) => setAxisCanvas(n)}
          cursorCanvasRef={(n) => setCursorCanvas(n)}
          tooltipRef={(n) => { tooltipRef.current = n; }}
        />
      </div>
    </div>
  );
}