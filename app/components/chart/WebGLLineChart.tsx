"use client";

/**
 * components/WebGLLineChart.tsx
 *
 * 싱글라인 전용 범용 차트 컴포넌트입니다.
 * 멀티라인이 필요하면 WebGLMultiLineChart.tsx를 사용하세요.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import * as d3 from "d3";
import type { LineChartConfig } from "@/lib/chart/chartConfig";
import type { ChartState } from "@/lib/chart/types";
import { initialYRangeFromValues, clampViewRangeMs } from "@/lib/chart/math";
import { drawWebGLLine, uploadLineData } from "@/lib/chart/webgl";
import { useAxesLayer } from "@/hooks/chart/useAxesLayer";
import { useCursorLayer } from "@/hooks/chart/useCursorLayer";
import { useChartInteractions } from "@/hooks/chart/useChartInteractions";
import { useWebGLLineLayer } from "@/hooks/chart/useWebGLLineLayer";
import { ChartCanvasStack } from "@/components/chart/ChartCanvasStack";
import { useChartData } from "@/hooks/useChartData";

const MARGIN = { top: 20, right: 20, bottom: 60, left: 50 };

interface WebGLLineChartProps {
  config: LineChartConfig;
  dynamic?: boolean;
}

export function WebGLLineChart({ config, dynamic = false }: WebGLLineChartProps) {
  const HEIGHT = config.height ?? 540;
  const firstLine = config.lines[0];

  // ── Refs ──────────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null);
  const chartStateRef = useRef<ChartState | null>(null);
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

  const { data, isLoading, updateViewRange, viewRange } = useChartData({
    lines: [firstLine],
    dynamic,
  });

  // ── 내부 치수 ─────────────────────────────────────────────────────────

  const getInnerDims = useCallback(
    () => ({
      innerW: containerWidth - MARGIN.left - MARGIN.right,
      innerH: HEIGHT - MARGIN.top - MARGIN.bottom,
    }),
    [containerWidth, HEIGHT]
  );

  // ── 차트 그리기 ───────────────────────────────────────────────────────

  const drawChartNow = useCallback(
    (cs: ChartState, innerW: number, innerH: number) => {
      drawWebGLLine(
        cs.webgl,
        cs.xScale,
        cs.yScale,
        cs.glCanvas.width,
        cs.glCanvas.height,
        MARGIN
      );
      drawAxes({
        ctx: cs.axisCtx,
        canvas: cs.axisCanvas,
        xScale: cs.xScale,
        yScale: cs.yScale,
        innerW,
        innerH,
      });
    },
    [drawAxes]
  );

  // ── WebGL 초기화 ──────────────────────────────────────────────────────

  const { wglRef, isReady: isWebGLReady } = useWebGLLineLayer({
    canvas: glCanvas,
    margin: MARGIN,
    timestamps: data?.timestamps ?? [],
    values: data?.values ?? [],
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
    if (!data || data.timestamps.length === 0) return;
    if (!glCanvas || !axisCanvas || !cursorCanvas) return;
    const wgl = wglRef.current;
    if (!isWebGLReady || !wgl) return;

    const { innerW, innerH } = getInnerDims();
    const { start: xMinMs, end: xMaxMs } = clampViewRangeMs(
      viewRange.start,
      viewRange.end
    );

    const y0 =
      config.yMin !== undefined && config.yMax !== undefined
        ? { min: config.yMin, max: config.yMax }
        : initialYRangeFromValues(data.values);

    const xScale = d3
      .scaleTime()
      .domain([new Date(xMinMs), new Date(xMaxMs)])
      .range([0, innerW]);
    const yScale = d3
      .scaleLinear()
      .domain([y0.min, y0.max])
      .range([innerH, 0]);

    const axisCtx = axisCanvas.getContext("2d")!;
    const cursorCtx = cursorCanvas.getContext("2d")!;

    wgl.pointCount = uploadLineData(wgl, data.timestamps, data.values);

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
      cursorValue: 0,
      cursorTime: 0,
    };

    dataRef.current = { timestamps: data.timestamps, values: data.values };
    chartStateRef.current = cs;
    drawChartNow(cs, innerW, innerH);
  }, [
    axisCanvas, containerWidth, cursorCanvas, data, config,
    drawChartNow, getInnerDims, glCanvas, isWebGLReady, viewRange, wglRef,
  ]);

  // ── 데이터 변경 시 업데이트 ───────────────────────────────────────────

  useEffect(() => {
    const cs = chartStateRef.current;
    if (!cs || !data || data.timestamps.length === 0) return;
    const { innerW, innerH } = getInnerDims();
    dataRef.current = { timestamps: data.timestamps, values: data.values };
    cs.webgl.pointCount = uploadLineData(cs.webgl, data.timestamps, data.values);
    drawChartNow(cs, innerW, innerH);
  }, [data, getInnerDims, drawChartNow]);

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
      const vals = dataRef.current.values;
      const bisect = d3.bisector((d: number) => d).left;
      let idx = bisect(ts, mouseTime);
      if (idx >= ts.length) idx = ts.length - 1;
      if (idx > 0) {
        const d0 = mouseTime - ts[idx - 1];
        const d1 = ts[idx] - mouseTime;
        if (d0 < d1) idx--;
      }

      const pointTime = ts[idx];
      const pointVal = vals[idx];
      if (!Number.isFinite(pointVal)) return;

      const px = cs.xScale(new Date(pointTime));
      const py = cs.yScale(pointVal);

      cs.cursorVisible = true;
      cs.cursorX = px;
      cs.cursorY = py;
      cs.cursorValue = pointVal;
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
        tip.textContent = config.formatTooltip(pointTime, pointVal, firstLine.label);
        const offsetX = 12, offsetY = 12;
        const tipW = tip.offsetWidth || 160;
        const tipH = tip.offsetHeight || 28;
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
  }, [config, firstLine.label, getInnerDims, drawCursor, containerWidth, HEIGHT]);

  // ── 렌더 ──────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full min-w-0 max-w-full overflow-hidden">
      {config.title && (
        <h2 className="text-sm font-medium text-gray-500 px-1 mb-1">
          {config.title}
        </h2>
      )}
      {isLoading && !data && (
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