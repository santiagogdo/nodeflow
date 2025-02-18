import { GradientDefinition, RadialGradient } from '../styles/styles';
import parseColor from './colorParser';

export type Interpolator<T> = (start: T, end: T, t: number) => T;

// Interpolator for numbers
export const numberInterpolator: Interpolator<number> = (start, end, t) =>
  start + (end - start) * t;

/**
 * Interpolator for arrays of numbers.
 * The length of the returned array is the minimum of the lengths of the start and end arrays.
 * The values at each index are interpolated using the numberInterpolator.
 * @param start The starting array of numbers
 * @param end The ending array of numbers
 * @param t The interpolation factor
 */
export const arrayInterpolator: Interpolator<Array<number>> = (start, end, t) => {
  const length = Math.min(start.length, end.length);
  return start.map((_, i) => numberInterpolator(start[i], end[i], t));
};

export const colorInterpolator: Interpolator<string> = (start, end, t) => {
  const startRGBA = parseColor(start);
  const endRGBA = parseColor(end);

  if (!startRGBA || !endRGBA) {
    console.warn('Invalid color format. Falling back to end color.');
    return end; // Fallback to end color if parsing fails
  }

  const r = Math.round(startRGBA.r + (endRGBA.r - startRGBA.r) * t);
  const g = Math.round(startRGBA.g + (endRGBA.g - startRGBA.g) * t);
  const b = Math.round(startRGBA.b + (endRGBA.b - startRGBA.b) * t);
  const a = parseFloat((startRGBA.a + (endRGBA.a - startRGBA.a) * t).toFixed(4)); // Limit to 4 decimal places

  // Determine if alpha channel should be included
  const includeAlpha = startRGBA.a !== 1 || endRGBA.a !== 1 || a !== 1;

  if (includeAlpha) {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  } else {
    return `rgb(${r}, ${g}, ${b})`;
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function gradientInterpolator(
  start: GradientDefinition,
  end: GradientDefinition,
  t: number
): GradientDefinition {
  if (start.type !== end.type) {
    console.warn('Mismatched gradient types. Falling back to end gradient type.');
  }

  const gradientType = end.type;

  const result: GradientDefinition = {
    type: gradientType,
    colorStops: [],
  };

  if (gradientType === 'linear') {
    // Interpolate linear-specific coords
    // (fall back if undefined, e.g., x0 => 0, x1 => 1)
    result.x0 = numberInterpolator(start.x0 ?? 0, end.x0 ?? 0, t);
    result.y0 = numberInterpolator(start.y0 ?? 0, end.y0 ?? 0, t);
    result.x1 = numberInterpolator(start.x1 ?? 1, end.x1 ?? 1, t);
    result.y1 = numberInterpolator(start.y1 ?? 1, end.y1 ?? 1, t);
  } else if (gradientType === 'radial') {
    // Interpolate radial-specific coords
    result.x0 = numberInterpolator(start.x0 ?? 0, end.x0 ?? 0, t);
    result.y0 = numberInterpolator(start.y0 ?? 0, end.y0 ?? 0, t);
    (result as RadialGradient).r0 = clamp(
      numberInterpolator((start as RadialGradient).r0 ?? 0, end.r0 ?? 0, t),
      0,
      1
    );

    result.x1 = numberInterpolator(start.x1 ?? 0, end.x1 ?? 0, t);
    result.y1 = numberInterpolator(start.y1 ?? 0, end.y1 ?? 0, t);
    (result as RadialGradient).r1 = clamp(
      numberInterpolator((start as RadialGradient).r1 ?? 0, end.r1 ?? 0, t),
      0,
      1
    );
  }

  // 2) Interpolate color stops
  const stopsA = start.colorStops;
  const stopsB = end.colorStops;

  // If you want to gracefully handle different length arrays,
  // you can do more complex matching. For now, pick min length.
  const length = Math.min(stopsA.length, stopsB.length);

  for (let i = 0; i < length; i++) {
    const sA = stopsA[i];
    const sB = stopsB[i];

    // Interpolate offset
    let offset = numberInterpolator(sA.offset, sB.offset, t);
    offset = clamp(offset, 0, 1);

    // Interpolate color (assuming you have some colorInterpolator)
    const color = colorInterpolator(sA.color, sB.color, t);

    result.colorStops.push({ offset, color });
  }

  return result;
}
