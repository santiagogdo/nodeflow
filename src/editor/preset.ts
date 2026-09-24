import type { DeepReadonly, GroupRecord, Rect } from "../core/index.ts";
import type { EdgeGeometry } from "./geometry.ts";
import type {
  ConnectionAppearance,
  ConnectionDrawContext,
  ConnectionMotion,
  ConnectionRenderPart,
  ConnectionStyle,
  InteractionMotion,
  PortAppearance,
  PortDrawContext,
  PortRenderPart,
  PortStyle,
} from "./linkTypes.ts";
import type {
  NodeAppearance,
  NodeDrawContext,
  NodeMotion,
  NodeRenderPart,
  NodeStyle,
  Theme,
  Viewport,
} from "./types.ts";

export interface CanvasDrawContext {
  context: CanvasRenderingContext2D;
  theme: Readonly<Theme>;
  viewport: Readonly<Viewport>;
  width: number;
  height: number;
  touch: boolean;
}
export interface MenuView {
  x: number;
  y: number;
  width: number;
  rowHeight: number;
  active: number;
  offset: number;
  visibleCount: number;
  items: readonly { readonly label: string; readonly disabled?: boolean }[];
}
export interface ConnectionBatch {
  color: string;
  width: number;
  opacity: number;
  dash: readonly number[];
  curves: readonly EdgeGeometry[];
}
/** All visual output lives here. Omitted methods draw nothing; there is no fallback painter.
 * World coordinates: group/node/port/connection. Screen coordinates: background/overlay. */
export interface EditorPainter {
  background?(view: CanvasDrawContext): void;
  group?(
    view: CanvasDrawContext,
    group: DeepReadonly<GroupRecord>,
    bounds: Rect,
    selected: boolean,
  ): void;
  node?(view: NodeDrawContext, part: Exclude<NodeRenderPart, "ports">): void;
  port?(
    view: PortDrawContext,
    parts: readonly PortRenderPart[],
    node: NodeDrawContext,
  ): void;
  connection?(
    view: ConnectionDrawContext,
    parts: readonly ConnectionRenderPart[],
  ): void;
  /** Optional overview optimization. Omit to receive individual connections at every zoom. */
  connectionBatch?(view: CanvasDrawContext, batch: ConnectionBatch): void;
  overlay?(
    view: CanvasDrawContext,
    overlay: { marquee: Rect | null; empty: boolean; menu: MenuView | null },
  ): void;
  destroy?(): void;
}
/** Complete visual defaults plus an isolated painter instance for each editor. */
export interface EditorPreset {
  theme: Readonly<Theme>;
  nodes: Omit<NodeAppearance, "style" | "motion"> & {
    style: Readonly<NodeStyle>;
    touchStyle?: Readonly<Partial<NodeStyle>>;
    motion: Readonly<NodeMotion>;
  };
  ports: Omit<PortAppearance, "style" | "motion"> & {
    style: Readonly<PortStyle>;
    touchStyle?: Readonly<Partial<PortStyle>>;
    motion: Readonly<InteractionMotion>;
  };
  connections: Omit<ConnectionAppearance, "style" | "motion"> & {
    style: Readonly<ConnectionStyle>;
    motion: Readonly<ConnectionMotion>;
  };
  menu: { readonly rowHeight: number; readonly touchRowHeight: number };
  createPainter(context: CanvasRenderingContext2D): EditorPainter;
}

/** Partial settings for createPreset(). Callbacks and arrays replace inherited values. */
export interface EditorPresetOverrides {
  theme?: Partial<Theme>;
  nodes?: Omit<NodeAppearance, "motion"> & {
    touchStyle?: Partial<NodeStyle>;
    motion?: Partial<NodeMotion>;
  };
  ports?: Omit<PortAppearance, "motion"> & {
    touchStyle?: Partial<PortStyle>;
    motion?: Partial<InteractionMotion>;
  };
  connections?: Omit<ConnectionAppearance, "motion"> & {
    motion?: Partial<ConnectionMotion>;
  };
  menu?: Partial<EditorPreset["menu"]>;
  createPainter?: EditorPreset["createPainter"];
}
