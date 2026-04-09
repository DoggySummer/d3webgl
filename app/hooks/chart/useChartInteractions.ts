import { useCallback, useEffect } from "react";
import { clampViewRangeMs } from "@/hooks/useTemperatureData";
import { clampYRange, countVisiblePoints } from "@/lib/chart/math";
import type { ChartState } from "@/lib/chart/types";

export type ChartMargin = { top: number; right: number; bottom: number; left: number };

export function useChartInteractions(params: {
  margin: ChartMargin;
  height: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  chartStateRef: React.RefObject<ChartState | null>;
  dataRef: React.RefObject<{ timestamps: number[]; values: number[] }>;
  getInnerDims: () => { innerW: number; innerH: number };
  updateViewRange: (start: number, end: number, visiblePoints: number) => void;
  drawChartNow: (cs: ChartState, innerW: number, innerH: number) => void;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  containerWidth: number;
}) {
  const doZoom = useCallback(
    (factor: number): number => {
      const cs = params.chartStateRef.current;
      if (!cs) return 0;
      const t0 = performance.now();
      const { innerW, innerH } = params.getInnerDims();

      const domain = cs.xScale.domain();
      const xMin = domain[0].getTime();
      const xMax = domain[1].getTime();
      const range = xMax - xMin;
      const newRange = range * factor;
      const center = (xMin + xMax) / 2;
      const clamped = clampViewRangeMs(center - newRange / 2, center + newRange / 2);

      cs.xScale.domain([new Date(clamped.start), new Date(clamped.end)]);
      params.drawChartNow(cs, innerW, innerH);

      const visiblePoints = countVisiblePoints(params.dataRef.current.timestamps, clamped.start, clamped.end);
      params.updateViewRange(clamped.start, clamped.end, visiblePoints);
      return performance.now() - t0;
    },
    [params]
  );

  const doPan = useCallback(
    (direction: number): number => {
      const cs = params.chartStateRef.current;
      if (!cs) return 0;
      const t0 = performance.now();
      const { innerW, innerH } = params.getInnerDims();

      const domain = cs.xScale.domain();
      const xMin = domain[0].getTime();
      const xMax = domain[1].getTime();
      const shift = (xMax - xMin) * 0.1 * direction;
      const clamped = clampViewRangeMs(xMin + shift, xMax + shift);

      cs.xScale.domain([new Date(clamped.start), new Date(clamped.end)]);
      params.drawChartNow(cs, innerW, innerH);

      const visiblePoints = countVisiblePoints(params.dataRef.current.timestamps, clamped.start, clamped.end);
      params.updateViewRange(clamped.start, clamped.end, visiblePoints);
      return performance.now() - t0;
    },
    [params]
  );

  // wheel zoom
  useEffect(() => {
    const el = params.containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cs = params.chartStateRef.current;
      if (!cs) return;
      const { innerW, innerH } = params.getInnerDims();

      const domain = cs.xScale.domain();
      const xMin = domain[0].getTime();
      const xMax = domain[1].getTime();
      const range = xMax - xMin;
      const rect = el.getBoundingClientRect();
      const ratio = (e.clientX - rect.left - params.margin.left) / innerW;
      const zoomFactor = e.deltaY > 0 ? 1.06 : 0.94;
      const newRange = range * zoomFactor;
      const newMin = xMin + (range - newRange) * ratio;
      const clamped = clampViewRangeMs(newMin, newMin + newRange);

      cs.xScale.domain([new Date(clamped.start), new Date(clamped.end)]);
      params.drawChartNow(cs, innerW, innerH);

      const visiblePoints = countVisiblePoints(params.dataRef.current.timestamps, clamped.start, clamped.end);
      params.updateViewRange(clamped.start, clamped.end, visiblePoints);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [params]);

  // drag pan (x + y)
  useEffect(() => {
    const el = params.containerRef.current;
    if (!el) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let startXMin = 0, startXMax = 0;
    let startYMin = 0, startYMax = 0;

    const hideTooltip = () => {
      const tip = params.tooltipRef.current;
      if (tip) tip.style.transform = "translate(-9999px, -9999px)";
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const cs = params.chartStateRef.current;
      if (!cs) return;
      e.preventDefault();
      isDragging = true;
      startX = e.clientX; startY = e.clientY;
      const xd = cs.xScale.domain();
      startXMin = xd[0].getTime(); startXMax = xd[1].getTime();
      const yd = cs.yScale.domain();
      startYMin = yd[0]; startYMax = yd[1];
      el.style.cursor = "grabbing";
      cs.cursorVisible = false;
      hideTooltip();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const cs = params.chartStateRef.current;
      if (!cs) return;
      const { innerW, innerH } = params.getInnerDims();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const xSpan = startXMax - startXMin;
      const ySpan = startYMax - startYMin;
      const dt = -(dx / innerW) * xSpan;
      const dyVal = (dy / innerH) * ySpan;

      const clamped = clampViewRangeMs(startXMin + dt, startXMax + dt);
      const yc = clampYRange(startYMin + dyVal, startYMax + dyVal);

      cs.xScale.domain([new Date(clamped.start), new Date(clamped.end)]);
      cs.yScale.domain([yc.min, yc.max]);
      params.drawChartNow(cs, innerW, innerH);

      const visiblePoints = countVisiblePoints(params.dataRef.current.timestamps, clamped.start, clamped.end);
      params.updateViewRange(clamped.start, clamped.end, visiblePoints);
    };

    const handleMouseUp = () => { isDragging = false; el.style.cursor = ""; };

    el.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      el.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [params]);

  return { doZoom, doPan };
}

