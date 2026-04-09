import { useCallback } from "react";
import { drawCursor as drawCursor2d } from "@/lib/chart/overlay2d";
import type { ChartMargin } from "@/lib/chart/overlay2d";

export function useCursorLayer(params: { margin: ChartMargin }) {
  const drawCursor = useCallback(
    (args: {
      ctx: CanvasRenderingContext2D;
      canvas: HTMLCanvasElement;
      cursorVisible: boolean;
      cursorX: number;
      cursorY: number;
      innerW: number;
      innerH: number;
    }) => {
      drawCursor2d({
        ...args,
        margin: params.margin,
      });
    },
    [params.margin]
  );

  return { drawCursor };
}

