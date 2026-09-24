import type {
  ConnectionRecord,
  DeepReadonly,
  NodeRecord,
  Point,
  PortDefinition,
} from "../core/index.ts";
import type { EdgeGeometry, NodeGeometry, PortLayout } from "./geometry.ts";
import type { Theme } from "./types.ts";

export interface InteractionMotion {
  /** Milliseconds. Zero changes interaction states immediately. */
  duration: number;
  easing: (progress: number) => number;
}
/** Dimensions use world pixels; null colors inherit the local theme/data type. */
export interface PortStyle {
  radius: number;
  width: number;
  /** Null fills the socket when connected; a number sets a custom center radius. */
  coreRadius: number | null;
  indicatorWidth: number;
  hitRadius: number;
  hoverScale: number;
  haloWidth: number;
  haloOpacity: number;
  color: string | null;
  fill: string | null;
  activeColor: string | null;
  invalidColor: string | null;
  opacity: number;
  incompatibleOpacity: number;
  labelColor: string | null;
  labelSize: number;
  labelGap: number;
  labelOffset: number;
  labelWidth: number;
}
export type PortCompatibility = "none" | "valid" | "invalid";
export type PortRenderPart = "halo" | "socket" | "core" | "indicator" | "label";
export interface PortDrawContext {
  context: CanvasRenderingContext2D;
  node: DeepReadonly<NodeRecord>;
  geometry: NodeGeometry;
  port: PortLayout;
  point: Point;
  side: "left" | "right" | "top" | "bottom";
  style: Readonly<PortStyle>;
  theme: Theme;
  color: string;
  connected: boolean;
  hovered: boolean;
  focused: boolean;
  connecting: boolean;
  compatibility: PortCompatibility;
  progress: Readonly<{ hover: number; connection: number; active: number }>;
  detail: "full" | "compact" | "overview";
}
export interface PortAppearance {
  style?: Partial<PortStyle>;
  motion?: false | Partial<InteractionMotion>;
  /** Replaces the entire port, including its label. Canvas state is isolated. */
  draw?: (
    port: PortDrawContext,
    drawDefault: (parts?: readonly PortRenderPart[]) => void,
  ) => void;
}
export type PortAppearanceResolver = (
  node: DeepReadonly<NodeRecord>,
  port: Readonly<PortDefinition>,
) => PortAppearance | undefined;

export interface ConnectionMotion extends InteractionMotion {
  /** World pixels per second, source to target. Zero disables flow animation. */
  flowSpeed: number;
}
export interface ConnectionStyle {
  color: string | null;
  targetColor: string | null;
  activeColor: string | null;
  invalidColor: string | null;
  width: number;
  hoverWidth: number;
  selectedWidth: number;
  hitWidth: number;
  opacity: number;
  outlineWidth: number;
  outlineColor: string | null;
  outlineOpacity: number;
  dash: readonly number[];
  pendingDash: readonly number[];
  pendingOpacity: number;
  flowWidth: number;
  flowLength: number;
  flowSpacing: number;
  flowColor: string | null;
  labelSize: number;
  labelColor: string | null;
  labelBackground: string | null;
  labelPadding: number;
  labelRadius: number;
  labelOffset: number;
}
export type ConnectionRenderPart =
  | "outline"
  | "line"
  | "flow"
  | "label";
export interface ConnectionDrawContext {
  context: CanvasRenderingContext2D;
  /** Null for the live connection preview. */
  connection: DeepReadonly<ConnectionRecord> | null;
  geometry: EdgeGeometry;
  theme: Theme;
  style: Readonly<ConnectionStyle>;
  color: string;
  targetColor: string;
  selected: boolean;
  hovered: boolean;
  pending: boolean;
  compatibility: PortCompatibility;
  running: boolean;
  progress: Readonly<{ hover: number; selection: number }>;
  /** Distance traveled in world pixels. Frozen at zero when motion is disabled. */
  flowOffset: number;
  detail: "full" | "compact" | "overview";
  scale: number;
}
export interface ConnectionAppearance {
  style?: Partial<ConnectionStyle>;
  motion?: false | Partial<ConnectionMotion>;
  draw?: (
    connection: ConnectionDrawContext,
    drawDefault: (parts?: readonly ConnectionRenderPart[]) => void,
  ) => void;
  /** Shared by painting and hit testing. Return control points, samples and bounds for your route. */
  geometry?: (
    geometry: EdgeGeometry,
    connection: DeepReadonly<ConnectionRecord> | null,
  ) => EdgeGeometry;
}
