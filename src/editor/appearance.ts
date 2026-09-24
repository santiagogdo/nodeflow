import type {
  EditorPreset,
  NodeAppearance,
  NodeMotion,
  NodeStyle,
  Theme,
} from "./types.ts";

export interface ResolvedAppearance {
  style: NodeStyle;
  theme: Theme;
  motion: NodeMotion | false;
  draw?: NodeAppearance["draw"];
  layout?: NodeAppearance["layout"];
  ports: NonNullable<NodeAppearance["ports"]>[];
}

/** Resolve once per geometry rebuild, never once per animation frame. */
export function resolveAppearance(
  base: EditorPreset["nodes"],
  theme: Theme,
  touch: boolean,
  ...layers: (NodeAppearance | undefined)[]
): ResolvedAppearance {
  const result: ResolvedAppearance = {
    style: {
      ...base.style,
      ...(touch ? base.touchStyle : {}),
    },
    theme: {
      ...theme,
      ...base.theme,
      portColors: { ...theme.portColors, ...base.theme?.portColors },
    },
    motion: { ...base.motion },
    draw: base.draw,
    layout: base.layout,
    ports: base.ports ? [base.ports] : [],
  };
  for (const layer of layers) {
    if (!layer) continue;
    Object.assign(result.style, layer.style);
    result.theme = {
      ...result.theme,
      ...layer.theme,
      portColors: { ...result.theme.portColors, ...layer.theme?.portColors },
    };
    if (layer.motion !== undefined) {
      result.motion = layer.motion === false ? false : {
        ...(result.motion || base.motion),
        ...layer.motion,
      };
    }
    if (layer.ports) result.ports.push(layer.ports);
    if (layer.draw) result.draw = layer.draw;
    if (layer.layout) result.layout = layer.layout;
  }
  for (const [key, value] of Object.entries(result.style)) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
      throw new Error(
        `Node style ${key} must be a finite, non-negative number`,
      );
    }
    if ((key.endsWith("Opacity") || key === "opacity") && Number(value) > 1) {
      throw new Error(`Node style ${key} must be between zero and one`);
    }
  }
  if (
    result.motion &&
    (typeof result.motion.easing !== "function" ||
      [result.motion.duration, result.motion.runningPeriod]
        .some((value) => !Number.isFinite(value) || value < 0))
  ) {
    throw new Error(
      "Node motion requires easing and finite, non-negative durations",
    );
  }
  return result;
}
