"use client";

import type { Ref } from "react";

export function ChartCanvasStack(props: {
  className?: string;
  width: number;
  height: number;
  glCanvasRef: Ref<HTMLCanvasElement>;
  axisCanvasRef: Ref<HTMLCanvasElement>;
  cursorCanvasRef: Ref<HTMLCanvasElement>;
  tooltipRef: Ref<HTMLDivElement>;
}) {
  return (
    <div
      className={props.className}
      style={{
        position: "relative",
        width: "100%",
        height: props.height,
      }}
    >
      <canvas
        ref={props.glCanvasRef}
        width={props.width}
        height={props.height}
        style={{ position: "absolute", top: 0, left: 0 }}
      />
      <canvas
        ref={props.axisCanvasRef}
        width={props.width}
        height={props.height}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      />
      <canvas
        ref={props.cursorCanvasRef}
        width={props.width}
        height={props.height}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      />
      <div
        ref={props.tooltipRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: "translate(-9999px, -9999px)",
          pointerEvents: "none",
          zIndex: 30,
          background: "rgba(17, 24, 39, 0.9)",
          color: "#fff",
          padding: "6px 8px",
          borderRadius: "8px",
          fontSize: 12,
          lineHeight: 1.2,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          whiteSpace: "nowrap",
        }}
      />
    </div>
  );
}

