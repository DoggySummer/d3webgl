import * as d3 from "d3";

export type ChartMargin = { top: number; right: number; bottom: number; left: number };

export function drawAxes(params: {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  xScale: d3.ScaleTime<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  innerW: number;
  innerH: number;
  margin: ChartMargin;
}) {
  const { ctx, canvas, xScale, yScale, innerW, innerH, margin } = params;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(margin.left, margin.top);

  // 격자
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  for (const tick of xScale.ticks(6)) {
    const x = xScale(tick);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, innerH);
    ctx.stroke();
  }
  for (const tick of yScale.ticks(6)) {
    const y = yScale(tick);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(innerW, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // x축
  ctx.strokeStyle = "#6b7280";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#374151";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.beginPath();
  ctx.moveTo(0, innerH);
  ctx.lineTo(innerW, innerH);
  ctx.stroke();

  const xDomain = xScale.domain();
  const spanMs = xDomain[1].getTime() - xDomain[0].getTime();
  const spanDays = spanMs / (1000 * 60 * 60 * 24);
  const fmt =
    spanDays > 365
      ? d3.timeFormat("%Y/%m")
      : spanDays > 30
        ? d3.timeFormat("%m/%d")
        : spanDays > 1
          ? d3.timeFormat("%m/%d %H:%M")
          : d3.timeFormat("%H:%M");

  for (const tick of xScale.ticks(6)) {
    const x = xScale(tick);
    ctx.beginPath();
    ctx.moveTo(x, innerH);
    ctx.lineTo(x, innerH + 5);
    ctx.stroke();
    ctx.fillText(fmt(tick), x, innerH + 8);
  }

  // y축
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, innerH);
  ctx.stroke();
  for (const tick of yScale.ticks(6)) {
    const y = yScale(tick);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(-5, y);
    ctx.stroke();
    ctx.fillText(String(tick), -8, y);
  }

  // °C 레이블
  ctx.save();
  ctx.translate(-38, innerH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#6b7280";
  ctx.fillText("°C", 0, 0);
  ctx.restore();

  ctx.restore();
}

export function drawCursor(params: {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  cursorVisible: boolean;
  cursorX: number;
  cursorY: number;
  innerW: number;
  innerH: number;
  margin: ChartMargin;
}) {
  const { ctx, canvas, cursorVisible, cursorX, cursorY, innerW, innerH, margin } = params;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!cursorVisible) return;

  ctx.save();
  ctx.translate(margin.left, margin.top);
  ctx.beginPath();
  ctx.rect(0, 0, innerW, innerH);
  ctx.clip();

  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(cursorX, 0);
  ctx.lineTo(cursorX, innerH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, cursorY);
  ctx.lineTo(innerW, cursorY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(cursorX, cursorY, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#2563eb";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

