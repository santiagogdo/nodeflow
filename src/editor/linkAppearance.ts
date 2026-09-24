import type {
  ConnectionAppearance,
  ConnectionMotion,
  ConnectionStyle,
  InteractionMotion,
  PortAppearance,
  PortStyle,
} from "./linkTypes.ts";
import type { EditorPreset } from "./types.ts";

export interface ResolvedPortAppearance {
  style: PortStyle;
  motion: InteractionMotion | false;
  draw?: PortAppearance["draw"];
}
export interface ResolvedConnectionAppearance {
  style: ConnectionStyle;
  motion: ConnectionMotion | false;
  draw?: ConnectionAppearance["draw"];
  geometry?: ConnectionAppearance["geometry"];
}
function validate(
  kind: string,
  style: object,
  motion: InteractionMotion | false,
) {
  for (const [key, value] of Object.entries(style)) {
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(
          `${kind} style ${key} must be a finite, non-negative number`,
        );
      }
      if (key.toLowerCase().endsWith("opacity") && value > 1) {
        throw new Error(`${kind} style ${key} must be between zero and one`);
      }
    }
    if (
      Array.isArray(value) &&
      value.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0)
    ) {
      throw new Error(
        `${kind} style ${key} must contain finite, non-negative numbers`,
      );
    }
  }
  if (motion) {
    if (typeof motion.easing !== "function") {
      throw new Error(`${kind} motion easing must be a function`);
    }
    for (const value of Object.values(motion)) {
      if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
        throw new Error(
          `${kind} motion must contain finite, non-negative numbers`,
        );
      }
    }
  }
}
export function resolvePortAppearance(
  base: EditorPreset["ports"],
  touch: boolean,
  ...layers: (PortAppearance | undefined)[]
): ResolvedPortAppearance {
  const result: ResolvedPortAppearance = {
    style: {
      ...base.style,
      ...(touch ? base.touchStyle : {}),
    },
    motion: { ...base.motion },
    draw: base.draw,
  };
  for (const layer of layers) {
    if (!layer) continue;
    Object.assign(result.style, layer.style);
    if (layer.motion !== undefined) {
      result.motion = layer.motion === false
        ? false
        : { ...(result.motion || base.motion), ...layer.motion };
    }
    if (layer.draw) result.draw = layer.draw;
  }
  validate("Port", result.style, result.motion);
  return result;
}
export function resolveConnectionAppearance(
  base: EditorPreset["connections"],
  ...layers: (ConnectionAppearance | undefined)[]
): ResolvedConnectionAppearance {
  const result: ResolvedConnectionAppearance = {
    style: { ...base.style },
    motion: { ...base.motion },
    draw: base.draw,
    geometry: base.geometry,
  };
  for (const layer of layers) {
    if (!layer) continue;
    Object.assign(result.style, layer.style);
    if (layer.motion !== undefined) {
      result.motion = layer.motion === false
        ? false
        : { ...(result.motion || base.motion), ...layer.motion };
    }
    if (layer.draw) result.draw = layer.draw;
    if (layer.geometry) result.geometry = layer.geometry;
  }
  result.style.dash = [...result.style.dash];
  result.style.pendingDash = [...result.style.pendingDash];
  validate("Connection", result.style, result.motion);
  return result;
}
