"use client";

/**
 * components/WebGLMultiLineChart.tsx
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
import { useAxesLayer } from "@/hooks/chart/useAxesLayer";
import { useCursorLayer } from "@/hooks/chart/useCursorLayer";
import { useChartInteractions } from "@/hooks/chart/useChartInteractions";
import { useWebGLLineLayer } from "@/hooks/chart/useWebGLLineLayer";
import { ChartCanvasStack } from "@/components/chart/ChartCanvasStack";
import { useChartData } from "@/hooks/useChartData";

const MARGIN = { top: 20, right: 20, bottom: 60, left: 50 };
const LEGEND_WIDTH = 120;
const DIMMED_ALPHA = 0.12;

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

interface LineBuf {
  xBuf: WebGLBuffer;
  yBuf: WebGLBuffer;
  count: number;
}

interface WebGLMultiLineChartProps {
  config: LineChartConfig;
}

export function WebGLMultiLineChart({ config }: WebGLMultiLineChartProps) {
  const HEIGHT = config.height ?? 540;

  const [activeLines, setActiveLines] = useState<boolean[]>(
    () => config.lines.map(() => true)
  );

  const toggleLine = useCallback((idx: number) => {
    setActiveLines((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartStateRef = useRef<ChartState | null>(null);
  const lineBufsRef = useRef<LineBuf[]>([]);
  const dataRef = useRef<{ timestamps: number[]; values: number[] }>({
    timestamps: [],
    values: [],
  });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const activeLinesRef = useRef<boolean[]>(activeLines);
  useEffect(() => { activeLinesRef.current = activeLines; }, [activeLines]);

  const [glCanvas, setGlCanvas] = useState<HTMLCanvasElement | null>(null);
  const [axisCanvas, setAxisCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cursorCanvas, setCursorCanvas] = useState<HTMLCanvasElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const { drawAxes } = useAxesLayer({ margin: MARGIN });
  const { drawCursor } = useCursorLayer({ margin: MARGIN });

  const { seriesData, data, isLoading, updateViewRange, viewRange } =
    useChartData({ lines: config.lines });

  const getInnerDims = useCallback(
    () => ({
      innerW: containerWidth - MARGIN.left - MARGIN.right,
      innerH: HEIGHT - MARGIN.top - MARGIN.bottom,
    }),
    [containerWidth, HEIGHT]
  );

  const drawChartNow = useCallback(
    (cs: ChartState, innerW: number, innerH: number) => {
      const { gl, program } = cs.webgl;
      const bufs = lineBufsRef.current;
      const active = activeLinesRef.current;

      if (bufs.length === 0) return;

      const canvasW = cs.glCanvas.width;
      const canvasH = cs.glCanvas.height;
      const xDomain = cs.xScale.domain();
      const yDomain = cs.yScale.domain();

      gl.viewport(0, 0, canvasW, canvasH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(MARGIN.left, MARGIN.bottom, innerW, innerH);
      gl.useProgram(program);

      // ★ Float32 fix: ms → 정규화값(0~1)으로 변환 후 uniform 전달
      const { domainStartMs, domainSpanMs } = cs.webgl;
      const viewStart = (xDomain[0].getTime() - domainStartMs) / domainSpanMs;
      const viewEnd = (xDomain[1].getTime() - domainStartMs) / domainSpanMs;

      gl.uniform1f(cs.webgl.uViewStart, viewStart);
      gl.uniform1f(cs.webgl.uViewEnd, viewEnd);
      gl.uniform1f(cs.webgl.uYMin, yDomain[0]);
      gl.uniform1f(cs.webgl.uYMax, yDomain[1]);
      gl.uniform2f(cs.webgl.uResolution, canvasW, canvasH);

      bufs.forEach((buf, i) => {
        const line = config.lines[i];
        if (!line) return;
        const [r, g, b] = hexToRgb(line.color);
        const alpha = active[i] ? 1.0 : DIMMED_ALPHA;

        gl.uniform4f(cs.webgl.uColor, r, g, b, alpha);

        gl.bindBuffer(gl.ARRAY_BUFFER, buf.xBuf);
        gl.enableVertexAttribArray(cs.webgl.aX);
        gl.vertexAttribPointer(cs.webgl.aX, 1, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, buf.yBuf);
        gl.enableVertexAttribArray(cs.webgl.aY);
        gl.vertexAttribPointer(cs.webgl.aY, 1, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.LINE_STRIP, 0, buf.count);
      });

      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);

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

  const { wglRef, isReady: isWebGLReady } = useWebGLLineLayer({
    canvas: glCanvas,
    margin: MARGIN,
    timestamps: data?.timestamps ?? [],
    values: data?.values ?? [],
  });

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

  useEffect(() => {
    return () => {
      // ★ GPU 버퍼 정리 (언마운트 시 메모리 누수 방지)
      const wgl = wglRef.current;
      if (wgl) {
        lineBufsRef.current.forEach(({ xBuf, yBuf }) => {
          wgl.gl.deleteBuffer(xBuf);
          wgl.gl.deleteBuffer(yBuf);
        });
      }
      lineBufsRef.current = [];
      chartStateRef.current = null;
      tooltipRef.current = null;
    };
  }, [wglRef]);

  // ── 차트 인스턴스 1회 생성 + GPU 버퍼 미리 올리기 ───────────────────

  useEffect(() => {
    if (!containerRef.current || containerWidth === 0) return;
    if (chartStateRef.current) return;
    if (!seriesData || seriesData.length === 0) return;
    if (seriesData[0].timestamps.length === 0) return;
    if (!glCanvas || !axisCanvas || !cursorCanvas) return;
    const wgl = wglRef.current;
    if (!isWebGLReady || !wgl) return;

    const { innerW, innerH } = getInnerDims();
    const gl = wgl.gl;

    const allTs = seriesData.flatMap((s) => s.timestamps);
    const xExtent = d3.extent(allTs) as [number, number];
    const { start: xMinMs, end: xMaxMs } = clampViewRangeMs(xExtent[0], xExtent[1]);

    const allVals = seriesData.flatMap((s) => s.values);
    const y0 =
      config.yMin !== undefined && config.yMax !== undefined
        ? { min: config.yMin, max: config.yMax }
        : initialYRangeFromValues(allVals);

    const xScale = d3
      .scaleTime()
      .domain([new Date(xMinMs), new Date(xMaxMs)])
      .range([0, innerW]);
    const yScale = d3
      .scaleLinear()
      .domain([y0.min, y0.max])
      .range([innerH, 0]);

    // ★ Float32 fix: 전체 도메인 기준으로 정규화값 계산 후 wgl에 저장
    const domainStart = xExtent[0];
    const domainSpan = xExtent[1] - xExtent[0] || 1;
    wgl.domainStartMs = domainStart;
    wgl.domainSpanMs = domainSpan;

    // ★ Float32 fix: 각 라인 timestamp를 [0,1]로 정규화 후 GPU 업로드
    lineBufsRef.current = seriesData.map((s) => {
      const xBuf = gl.createBuffer()!;
      const yBuf = gl.createBuffer()!;

      const xs = new Float32Array(
        s.timestamps.map((t) => (t - domainStart) / domainSpan)
      );
      const ys = new Float32Array(
        s.values.map((v) => (Number.isFinite(v) ? v : -9999))
      );

      gl.bindBuffer(gl.ARRAY_BUFFER, xBuf);
      gl.bufferData(gl.ARRAY_BUFFER, xs, gl.STATIC_DRAW);

      gl.bindBuffer(gl.ARRAY_BUFFER, yBuf);
      gl.bufferData(gl.ARRAY_BUFFER, ys, gl.STATIC_DRAW);

      return { xBuf, yBuf, count: s.timestamps.length };
    });

    dataRef.current = {
      timestamps: seriesData[0].timestamps,
      values: seriesData[0].values,
    };
    wgl.pointCount = seriesData[0].timestamps.length;

    const cs: ChartState = {
      xScale,
      yScale,
      glCanvas,
      webgl: wgl,
      axisCanvas,
      axisCtx: axisCanvas.getContext("2d")!,
      cursorCanvas,
      cursorCtx: cursorCanvas.getContext("2d")!,
      cursorVisible: false,
      cursorX: 0,
      cursorY: 0,
      cursorValue: 0,
      cursorTime: 0,
    };

    chartStateRef.current = cs;
    drawChartNow(cs, innerW, innerH);
  }, [
    axisCanvas, containerWidth, cursorCanvas, seriesData,
    config, drawChartNow, getInnerDims, glCanvas, isWebGLReady, viewRange, wglRef,
  ]);

  useEffect(() => {
    const cs = chartStateRef.current;
    if (!cs) return;
    const { innerW, innerH } = getInnerDims();
    drawChartNow(cs, innerW, innerH);
  }, [activeLines, getInnerDims, drawChartNow]);

  useEffect(() => {
    const cs = chartStateRef.current;
    if (!cs || containerWidth === 0) return;
    const { innerW, innerH } = getInnerDims();
    cs.xScale.range([0, innerW]);
    drawChartNow(cs, innerW, innerH);
  }, [containerWidth, getInnerDims, drawChartNow]);

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
      const firstVal = dataRef.current.values[idx];
      if (!Number.isFinite(firstVal)) return;

      const px = cs.xScale(new Date(pointTime));
      const py = cs.yScale(firstVal);

      cs.cursorVisible = true;
      cs.cursorX = px;
      cs.cursorY = py;
      cs.cursorValue = firstVal;
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
      if (tip && seriesData) {
        const dateStr = d3.timeFormat("%Y-%m-%d %H:%M")(new Date(pointTime));
        const lines = seriesData
          .map((s, i) => {
            if (!activeLinesRef.current[i]) return null;
            return config.formatTooltip(pointTime, s.values[idx], config.lines[i].label);
          })
          .filter(Boolean)
          .join("\n");

        tip.style.whiteSpace = "pre";
        tip.textContent = `${dateStr}\n${lines}`;

        const offsetX = 12, offsetY = 12;
        const tipW = tip.offsetWidth || 180;
        const tipH = tip.offsetHeight || 48;
        const cw = containerRef.current?.clientWidth ?? containerWidth;
        const ch = containerRef.current?.clientHeight ?? HEIGHT;
        const left = Math.max(6, Math.min(MARGIN.left + mx + offsetX, cw - tipW - 6));
        const top = Math.max(6, Math.min(MARGIN.top + my - offsetY - tipH, ch - tipH - 6));
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
  }, [config, seriesData, getInnerDims, drawCursor, containerWidth, HEIGHT]);

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

      <div className="flex items-stretch w-full">
        <div
          ref={containerRef}
          className="flex-1 min-w-0 cursor-grab active:cursor-grabbing"
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

        <div
          className="flex flex-col justify-center gap-3 pl-4 pr-2 shrink-0"
          style={{ width: LEGEND_WIDTH }}
        >
          {config.lines.map((line, i) => {
            const isActive = activeLines[i];
            return (
              <button
                key={line.label}
                onClick={() => toggleLine(i)}
                className="flex items-center gap-2 text-left transition-opacity"
                style={{ opacity: isActive ? 1 : 0.35 }}
              >
                <span
                  className="shrink-0 w-3 h-3 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: isActive ? line.color : "transparent",
                    borderColor: line.color,
                  }}
                />
                <span className="text-xs text-gray-700 font-medium">
                  {line.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}