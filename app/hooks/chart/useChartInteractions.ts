import { useCallback, useEffect } from "react";
import { clampYRange, countVisiblePoints, clampViewRangeMs } from "@/lib/chart/math";
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
  // ── 데이터 도메인 헬퍼 ───────────────────────────────────────────────
  // timestamps 배열의 첫/끝값을 domainStart/domainEnd로 사용
  // dynamic 모드에서는 fetch된 구간이 바뀔 때마다 dataRef가 갱신되므로
  // 항상 dataRef.current에서 직접 읽어야 최신값을 얻을 수 있음
  const getDomain = () => {
    const ts = params.dataRef.current.timestamps;
    if (ts.length === 0) return { domainStart: undefined, domainEnd: undefined };
    return { domainStart: ts[0], domainEnd: ts[ts.length - 1] };
  };

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

      // ★ domainStart/domainEnd 추가
      const { domainStart, domainEnd } = getDomain();
      const clamped = clampViewRangeMs(
        center - newRange / 2,
        center + newRange / 2,
        domainStart,
        domainEnd
      );

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

      // ★ domainStart/domainEnd 추가
      const { domainStart, domainEnd } = getDomain();
      const clamped = clampViewRangeMs(
        xMin + shift,
        xMax + shift,
        domainStart,
        domainEnd
      );

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

      // ★ domainStart/domainEnd 추가
      const { domainStart, domainEnd } = getDomain();
      const clamped = clampViewRangeMs(
        newMin,
        newMin + newRange,
        domainStart,
        domainEnd
      );

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

      // ★ domainStart/domainEnd 추가
      const { domainStart, domainEnd } = getDomain();
      const clamped = clampViewRangeMs(
        startXMin + dt,
        startXMax + dt,
        domainStart,
        domainEnd
      );
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