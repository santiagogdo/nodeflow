import type {
  ConnectionRecord,
  DeepReadonly,
  GraphDocument,
  JsonValue,
  NodeData,
  NodeRecord,
  Point,
  Rect,
} from "../core/index.ts";
import type { NodeResult } from "../runtime/types.ts";
import type { NodeGeometry } from "./geometry.ts";
import type {
  ConnectionAppearance,
  PortAppearance,
  PortAppearanceResolver,
} from "./linkTypes.ts";
export type * from "./linkTypes.ts";
export type * from "./preset.ts";
import type { EditorPreset } from "./preset.ts";

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}
export interface Theme {
  canvas: string;
  surface: string;
  node: string;
  input: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  grid: string;
  danger: string;
  success: string;
  font: string;
  portColors: Record<string, string>;
}
export type BuiltInControl =
  | "text"
  | "textarea"
  | "number"
  | "toggle"
  | "slider"
  | "select"
  | "button";

/** Dimensions are world pixels. Opacities are in [0, 1]; zero removes an effect. */
export interface NodeStyle {
  radius: number;
  padding: number;
  headerHeight: number;
  footerHeight: number;
  controlRadius: number;
  controlHeight: number;
  controlGap: number;
  labelHeight: number;
  inputPadding: number;
  inputPaddingY: number;
  inputColumnWidth: number;
  titleSize: number;
  titleWeight: number;
  fontSize: number;
  labelSize: number;
  lineHeight: number;
  iconSize: number;
  iconRadius: number;
  borderWidth: number;
  selectionWidth: number;
  opacity: number;
  blur: number;
  /** Backdrop displacement at the outer edge, in world pixels. Zero disables lensing. */
  refraction: number;
  /** Width of the curved edge where displacement falls toward the clear center. */
  refractionWidth: number;
  highlight: string;
  highlightOpacity: number;
  tintOpacity: number;
  lightOpacity: number;
  shadow: string;
  shadowBlur: number;
  shadowOffset: number;
  dragShadow: number;
  glow: number;
  dividerOpacity: number;
  disabledOpacity: number;
}
export interface NodeMotion {
  /** Duration in milliseconds for hover, selection, drag depth and switches. */
  duration: number;
  easing: (progress: number) => number;
  /** Set to zero to show a static running indicator. */
  runningPeriod: number;
}
export type NodeRenderPart = "surface" | "header" | "body" | "ports" | "status";
export interface NodeDrawContext {
  context: CanvasRenderingContext2D;
  node: DeepReadonly<NodeRecord>;
  geometry: NodeGeometry;
  theme: Theme;
  style: Readonly<NodeStyle>;
  result?: NodeResult;
  selected: boolean;
  hovered: boolean;
  dragging: boolean;
  /** Eased 0–1 values. Geometry stays stationary so ports and inputs stay aligned. */
  progress: Readonly<{ hover: number; selection: number; drag: number }>;
  pointer: Point | null;
  detail: "full" | "compact" | "overview";
  /** Live values, focus, selection and validation for fully custom control painting. */
  getControlState: (id: string) => ControlDrawState | undefined;
  getControlPainter: (id: string) => CustomControl["draw"] | undefined;
  presentation: Readonly<NodePresentation>;
  scale: number;
  pixelRatio: number;
  offset: Point;
  now: number;
  motion: Readonly<NodeMotion> | false;
  /** Scoped to this node; honors its motion and system reduced-motion preferences. */
  transition: (channel: string, target: number) => number;
  /** Request another frame for visible execution animation. */
  requestFrame: () => void;
  /** Lazily snapshots the scene underneath this node; no buffer exists until requested. */
  getBackdrop: () => HTMLCanvasElement;
}
export interface ControlDrawState {
  value: JsonValue | undefined;
  focused: boolean;
  disabled: boolean;
  caret: boolean;
  editing:
    | Readonly<{
      value: string;
      start: number;
      end: number;
      scrollLeft?: number;
      scrollTop?: number;
      error?: string;
    }>
    | null;
}
/** Call drawDefault() for all parts, or pass only the parts you want to keep. */
export type NodePainter = (
  node: NodeDrawContext,
  drawDefault: (parts?: readonly NodeRenderPart[]) => void,
) => void;
export interface NodeAppearance {
  /** Port defaults for this node, merged over EditorOptions.ports. */
  ports?: PortAppearance;
  style?: Partial<NodeStyle>;
  theme?: Partial<Theme>;
  motion?: false | Partial<NodeMotion>;
  draw?: NodePainter;
  /** Final layout hook; drawing, hit testing, edges and native inputs share its result. */
  layout?: (
    geometry: NodeGeometry,
    node: DeepReadonly<NodeRecord>,
  ) => NodeGeometry;
}
export interface ControlContext {
  document: GraphDocument;
  graphId: string;
  nodeId: string;
}
export interface ControlDefinition {
  id: string;
  kind: BuiltInControl | (string & {});
  label: string;
  key?: string;
  placeholder?: string;
  options?: readonly { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  height?: number;
  validate?: (value: JsonValue) => string | undefined;
  action?: (context: ControlContext) => void;
  /** Replaces this control's field drawing; label, input and semantics stay built in. */
  draw?: CustomControl["draw"];
}
export interface NodePresentation {
  type: string;
  icon?:
    | "database"
    | "filter"
    | "map"
    | "table"
    | "subgraph"
    | "number"
    | "bolt"
    | "code"
    | "shape"
    | "controls";
  color?: string;
  appearance?: NodeAppearance;
  /** Replaces the built-in icon inside its well. */
  drawIcon?: (
    context: CanvasRenderingContext2D,
    bounds: Rect,
    theme: Theme,
  ) => void;
  width?: number;
  portLayout?: "column" | "row";
  description?: string;
  summary?: (data: DeepReadonly<NodeData>, result?: NodeResult) => string;
  controls?:
    | readonly ControlDefinition[]
    | ((node: DeepReadonly<NodeRecord>) => readonly ControlDefinition[]);
  draw?: (
    context: CanvasRenderingContext2D,
    bounds: Rect,
    node: DeepReadonly<NodeRecord>,
    theme: Theme,
  ) => void;
}
export interface CustomControl {
  kind: string;
  height: number;
  draw(
    context: CanvasRenderingContext2D,
    bounds: Rect,
    value: JsonValue | undefined,
    theme: Theme,
    state?: ControlDrawState,
  ): void;
  pointer?(
    point: Point,
    bounds: Rect,
    value: JsonValue | undefined,
  ): JsonValue | undefined;
  key?(key: string, value: JsonValue | undefined): JsonValue | undefined;
  accessibleValue?(value: JsonValue | undefined): string;
}
export interface EditorCommand {
  id: string;
  label: string;
  run(editor: EditorInterface): void;
}
export interface EditorExtension {
  presentations?: readonly NodePresentation[];
  controls?: readonly CustomControl[];
  commands?: readonly EditorCommand[];
}
export interface EditorInterface {
  readonly document: GraphDocument;
  readonly graphId: string;
  getSelection(): Selection;
  setSelection(selection: Partial<Selection>): void;
  getViewport(): Viewport;
  setViewport(viewport: Partial<Viewport>): void;
  fitView(nodeIds?: readonly string[]): void;
  openGraph(graphId: string): void;
}
export interface Selection {
  nodes: string[];
  connections: string[];
  groups: string[];
}
export interface EditorOptions {
  document: GraphDocument;
  /** Explicit visual implementation. Import a preset or supply your own. */
  preset: EditorPreset;
  extensions?: readonly EditorExtension[];
  theme?: Partial<Theme>;
  /** Default node appearance. Type and instance overrides merge on top. */
  nodes?: NodeAppearance;
  nodeAppearance?: (
    node: DeepReadonly<NodeRecord>,
  ) => NodeAppearance | undefined;
  ports?: PortAppearance;
  portAppearance?: PortAppearanceResolver;
  connections?: ConnectionAppearance;
  connectionAppearance?: (
    connection: DeepReadonly<ConnectionRecord>,
  ) => ConnectionAppearance | undefined;
  touch?: boolean;
  /** Optional grid spacing in world pixels. Defaults to free dragging; Alt bypasses snapping. */
  snapToGrid?: false | number;
  viewport?: Partial<Viewport>;
  onError?: (message: string) => void;
}
export interface EditorEvent {
  type: "selection" | "viewport" | "graph" | "error" | "render";
  message?: string;
  duration?: number;
}
