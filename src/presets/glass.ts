import type { Point, Rect } from "../core/index.ts";

export interface GlassLens {
  radius: number;
  blur: number;
  refraction: number;
  refractionWidth: number;
}

/** Canvas-native lens: concentric contours sample progressively displaced backdrop
 * regions. The center is clear; only the curved perimeter bends the scene.
 * No pixel readbacks, image assets, shaders, or per-node canvas allocations. */
export function drawGlassLens(
  context: CanvasRenderingContext2D,
  backdrop: HTMLCanvasElement,
  bounds: Rect,
  style: GlassLens,
  scale: number,
  origin: Point,
  energy = 0,
) {
  const { x, y, width, height } = bounds;
  if (width <= 0 || height <= 0) return;
  const rim = Math.min(style.refractionWidth, width / 4, height / 4);
  const strength = Math.min(
    style.refraction * (1 + energy * 0.2),
    width / 4,
    height / 4,
  );
  const steps = rim > 0 && strength > 0 ? 8 : 0;
  const radius = Math.min(style.radius, width / 2, height / 2);
  context.save();
  try {
    // Filters are optional in Canvas 2D (notably on WebKit). Lensing is independent.
    if ("filter" in context && style.blur > 0) {
      context.filter = `blur(${style.blur * scale}px)`;
    }
    const sample = (displacement: number) => {
      const sx = (x + displacement) * scale + origin.x;
      const sy = (y + displacement) * scale + origin.y;
      const sw = (width - displacement * 2) * scale;
      const sh = (height - displacement * 2) * scale;
      // Explicit clipping keeps partially offscreen samples consistent in WebKit.
      const left = Math.max(0, sx), top = Math.max(0, sy);
      const right = Math.min(backdrop.width, sx + sw);
      const bottom = Math.min(backdrop.height, sy + sh);
      if (right <= left || bottom <= top) return;
      context.drawImage(
        backdrop,
        left,
        top,
        right - left,
        bottom - top,
        x + (left - sx) / sw * width,
        y + (top - sy) / sh * height,
        (right - left) / sw * width,
        (bottom - top) / sh * height,
      );
    };
    if (style.blur > 0 && "filter" in context) {
      context.save();
      context.beginPath();
      context.roundRect(x, y, width, height, radius);
      context.clip();
      sample(0);
      context.restore();
    }
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const inset = rim * t, inner = rim * (i + 1) / steps;
      context.save();
      context.beginPath();
      context.roundRect(
        x + inset,
        y + inset,
        width - inset * 2,
        height - inset * 2,
        Math.max(0, radius - inset),
      );
      context.roundRect(
        x + inner,
        y + inner,
        width - inner * 2,
        height - inner * 2,
        Math.max(0, radius - inner),
      );
      context.clip("evenodd");
      sample(strength * (1 - t) ** 2);
      context.restore();
    }
  } finally {
    context.restore();
  }
}
