import type {
  ConnectionDrawContext,
  ConnectionRenderPart,
  PortDrawContext,
  PortRenderPart,
} from "../editor/linkTypes.ts";

function alpha(
  ctx: CanvasRenderingContext2D,
  opacity: number,
  draw: () => void,
) {
  ctx.save();
  try {
    ctx.globalAlpha *= opacity;
    draw();
  } finally {
    ctx.restore();
  }
}
/** Each default part is isolated too, allowing custom painters to compose in any order. */
export function drawConnection(
  view: ConnectionDrawContext,
  parts: readonly ConnectionRenderPart[] = [
    "outline",
    "line",
    "flow",
    "label",
  ],
) {
  const { context: ctx, geometry: g, style: s } = view;
  // Keep low-zoom lines legible, but let cables grow with their sockets above 1×.
  const scale = Math.min(1, Math.max(0.65, view.scale));
  const width = (s.width + (s.hoverWidth - s.width) * view.progress.hover +
    (s.selectedWidth - s.width) * view.progress.selection *
      (1 - view.progress.hover)) / scale;
  const opacity = s.opacity * (view.pending ? s.pendingOpacity : 1);
  const stroke = (
    color: string | CanvasGradient,
    weight: number,
    opacity: number,
  ) => {
    if (weight <= 0 || opacity <= 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    alpha(ctx, opacity, () => ctx.stroke());
  };
  for (const part of parts) {
    ctx.save();
    try {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(
        (view.pending ? s.pendingDash : s.dash).map((n) => n / scale),
      );
      ctx.beginPath();
      ctx.moveTo(g.source.x, g.source.y);
      ctx.bezierCurveTo(g.c1.x, g.c1.y, g.c2.x, g.c2.y, g.target.x, g.target.y);
      if (part === "outline" && s.outlineWidth > 0) {
        stroke(
          s.outlineColor ?? view.theme.canvas,
          width + s.outlineWidth / scale,
          s.outlineOpacity * opacity,
        );
      } else if (part === "line") {
        let color: string | CanvasGradient = view.color;
        if (view.targetColor !== view.color) {
          const gradient = ctx.createLinearGradient(
            g.source.x,
            g.source.y,
            g.target.x === g.source.x && g.target.y === g.source.y
              ? g.target.x + 0.01
              : g.target.x,
            g.target.y,
          );
          gradient.addColorStop(0, view.color);
          gradient.addColorStop(1, view.targetColor);
          color = gradient;
        }
        stroke(color, width, opacity);
      } else if (
        part === "flow" && view.running && view.detail === "full" &&
        s.flowLength > 0
      ) {
        ctx.setLineDash([s.flowLength, s.flowSpacing]);
        ctx.lineDashOffset = -view.flowOffset;
        stroke(s.flowColor ?? view.theme.text, s.flowWidth / scale, opacity);
      } else if (
        part === "label" && view.connection?.label && view.detail === "full" &&
        s.labelSize > 0
      ) {
        ctx.setLineDash([]);
        const p = g.samples[Math.floor(g.samples.length / 2)];
        const text = view.connection.label;
        ctx.font = `${s.labelSize}px ${view.theme.font}`;
        const w = ctx.measureText(text).width + s.labelPadding * 2;
        const h = s.labelSize + s.labelPadding * 2;
        ctx.fillStyle = s.labelBackground ?? view.theme.surface;
        ctx.beginPath();
        ctx.roundRect(
          p.x - w / 2,
          p.y - s.labelOffset - h / 2,
          w,
          h,
          Math.min(s.labelRadius, h / 2, w / 2),
        );
        alpha(ctx, opacity, () => ctx.fill());
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = s.labelColor ?? view.theme.text;
        alpha(ctx, opacity, () => ctx.fillText(text, p.x, p.y - s.labelOffset));
      }
    } finally {
      ctx.restore();
    }
  }
}
export function drawPort(
  view: PortDrawContext,
  label: () => void,
  parts: readonly PortRenderPart[] = [
    "halo",
    "socket",
    "core",
    "indicator",
    "label",
  ],
) {
  const { context: ctx, point: p, style: s } = view;
  const hover = view.progress.hover;
  const radius = s.radius * (1 + (s.hoverScale - 1) * hover);
  const active = Math.max(hover, view.progress.active);
  const opacity = s.opacity *
    (view.compatibility === "invalid" && !view.hovered && !view.focused
      ? s.incompatibleOpacity
      : 1);
  const circle = (r: number) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0, r), 0, Math.PI * 2);
  };
  for (const part of parts) {
    ctx.save();
    try {
      ctx.globalAlpha *= opacity;
      if (part === "halo" && s.haloWidth > 0 && active > 0) {
        circle(radius + s.width / 2 + s.haloWidth / 2);
        ctx.strokeStyle = view.color;
        ctx.lineWidth = s.haloWidth;
        alpha(ctx, active * s.haloOpacity, () => ctx.stroke());
      } else if (part === "socket") {
        circle(radius);
        ctx.fillStyle = s.fill ?? view.theme.surface;
        ctx.fill();
        ctx.strokeStyle = view.color;
        ctx.lineWidth = s.width;
        if (s.width > 0) ctx.stroke();
      } else if (
        part === "core" && view.progress.connection > 0 &&
        !(view.compatibility === "invalid" && (view.hovered || view.focused))
      ) {
        circle(
          Math.min(radius, s.coreRadius ?? radius) * view.progress.connection,
        );
        ctx.fillStyle = view.color;
        ctx.fill();
      } else if (
        part === "indicator" && s.indicatorWidth > 0 &&
        view.compatibility === "invalid" && (view.hovered || view.focused)
      ) {
        const r = radius * 0.4;
        ctx.beginPath();
        ctx.moveTo(p.x - r, p.y - r);
        ctx.lineTo(p.x + r, p.y + r);
        ctx.moveTo(p.x + r, p.y - r);
        ctx.lineTo(p.x - r, p.y + r);
        ctx.strokeStyle = view.color;
        ctx.lineCap = "round";
        ctx.lineWidth = s.indicatorWidth;
        ctx.stroke();
      } else if (
        part === "label" && view.detail === "full" && s.labelSize > 0
      ) {
        label();
      }
    } finally {
      ctx.restore();
    }
  }
}
