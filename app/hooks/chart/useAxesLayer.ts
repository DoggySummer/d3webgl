import { useCallback } from "react";
import type * as d3 from "d3";
import type { ChartMargin } from "@/lib/chart/overlay2d";
import { drawAxes as drawAxes2d } from "@/lib/chart/overlay2d";

export function useAxesLayer(params: {
  margin: ChartMargin;
}) {
  const drawAxes = useCallback(
    (args: {
      ctx: CanvasRenderingContext2D;
      canvas: HTMLCanvasElement;
      xScale: d3.ScaleTime<number, number>;
      yScale: d3.ScaleLinear<number, number>;
      innerW: number;
      innerH: number;
    }) => {
      drawAxes2d({
        ...args,
        margin: params.margin,
      });
    },
    [params.margin]
  );

  return { drawAxes };
}

