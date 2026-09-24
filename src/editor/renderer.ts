import type {
  ConnectionRecord,
  DeepReadonly,
  Endpoint,
  GraphRecord,
  JsonValue,
  Point,
  Rect,
} from "../core/index.ts";
import type { NodeResult } from "../runtime/types.ts";
import { edgeCurve, routeConnection } from "./geometry.ts";
import type { ControlLayout, NodeLayout, SceneGeometry } from "./geometry.ts";
import type {
  CanvasDrawContext,
  CustomControl,
  EditorPainter,
  NodeDrawContext,
  NodeRenderPart,
  Selection,
  Theme,
  Viewport,
} from "./types.ts";
import type {
  ConnectionDrawContext,
  ConnectionRenderPart,
  PortCompatibility,
  PortDrawContext,
  PortRenderPart,
} from "./linkTypes.ts";
import type { ResolvedConnectionAppearance } from "./linkAppearance.ts";
import { NodeTransitions } from "./motion.ts";
import { intersects } from "./spatial.ts";

export interface TextEditState {
  nodeId: string;
  controlId: string;
  value: string;
  start: number;
  end: number;
  scrollLeft?: number;
  scrollTop?: number;
  error?: string;
}
export interface CanvasMenu {
  x: number;
  y: number;
  width: number;
  rowHeight: number;
  active: number;
  offset: number;
  visibleCount: number;
  items: { label: string; action: () => void; disabled?: boolean }[];
}
export interface RenderState {
  graph: DeepReadonly<GraphRecord>;
  geometry: SceneGeometry;
  viewport: Viewport;
  selection: Selection;
  previews: Map<string, Point>;
  values: Map<string, JsonValue>;
  results: Map<string, NodeResult>;
  custom: Map<string, CustomControl>;
  pending:
    | { nodeId: string; portId: string; point: Point; reconnect?: string }
    | null;
  hovered: string | null;
  hoveredPort: Endpoint | null;
  focusedPort: Endpoint | null;
  hoveredConnection: string | null;
  connectionTargets: Map<string, PortCompatibility>;
  pointer: Point | null;
  reducedMotion: boolean;
  now: number;
  focusedControl: string | null;
  marquee: Rect | null;
  editing: TextEditState | null;
  caret: boolean;
  menu: CanvasMenu | null;
  width: number;
  height: number;
  ratio: number;
  theme: Theme;
  touch: boolean;
}

export class CanvasRenderer {
  private transitions = new NodeTransitions();
  private backdrop?: HTMLCanvasElement;
  private backdropReady = false;
  private running = false;
  resetMotion() {
    this.transitions.clear();
  }
  destroy() {
    this.transitions.clear();
    this.painter.destroy?.();
    if (this.backdrop) this.backdrop.width = this.backdrop.height = 0;
    this.backdrop = undefined;
  }
  constructor(
    private ctx: CanvasRenderingContext2D,
    private painter: EditorPainter,
  ) {}
  private isolated(draw: () => void) {
    this.ctx.save();
    try {
      draw();
    } finally {
      this.ctx.restore();
    }
  }
  private getBackdrop() {
    if (!this.backdropReady) {
      this.backdrop ??= document.createElement("canvas");
      if (
        this.backdrop.width !== this.ctx.canvas.width ||
        this.backdrop.height !== this.ctx.canvas.height
      ) {
        this.backdrop.width = this.ctx.canvas.width;
        this.backdrop.height = this.ctx.canvas.height;
      }
      const copy = this.backdrop.getContext("2d")!;
      copy.clearRect(0, 0, this.backdrop.width, this.backdrop.height);
      copy.drawImage(this.ctx.canvas, 0, 0);
      this.backdropReady = true;
    }
    return this.backdrop!;
  }
  render(state: RenderState): boolean {
    this.transitions.begin();
    this.running = false;
    this.backdropReady = false;
    const ctx = this.ctx,
      t = state.theme,
      v = state.viewport;
    ctx.setTransform(state.ratio, 0, 0, state.ratio, 0, 0);
    ctx.clearRect(0, 0, state.width, state.height);
    const canvasView: CanvasDrawContext = {
      context: ctx,
      theme: t,
      viewport: v,
      width: state.width,
      height: state.height,
      touch: state.touch,
    };
    this.isolated(() => this.painter.background?.(canvasView));
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.scale(v.scale, v.scale);
    ctx.textBaseline = "middle";
    const visible = {
      x: -v.x / v.scale - 60,
      y: -v.y / v.scale - 60,
      width: state.width / v.scale + 120,
      height: state.height / v.scale + 120,
    };
    for (const [id, bounds] of state.geometry.groups) {
      if (intersects(visible, bounds)) {
        this.isolated(() =>
          this.painter.group?.(
            canvasView,
            state.graph.groups[id],
            bounds,
            state.selection.groups.includes(id),
          )
        );
      }
    }
    const visibleEdges = new Set(state.geometry.edgeIndex.query(visible));
    // Keep far-zoom topology batched. Custom painters still run at every zoom.
    const edgeBatches = new Map<
      string,
      {
        color: string;
        width: number;
        opacity: number;
        dash: readonly number[];
        curves: ReturnType<typeof edgeCurve>[];
      }
    >();
    if (state.previews.size) {
      for (const edge of Object.values(state.graph.connections)) {
        if (
          state.previews.has(edge.source.nodeId) ||
          state.previews.has(edge.target.nodeId)
        ) visibleEdges.add(edge.id);
      }
    }
    for (const id of visibleEdges) {
      let edge = state.geometry.edges.get(id)!;
      const connection = state.graph.connections[id];
      if (!edge || !connection || id === state.pending?.reconnect) continue;
      const appearance = state.geometry.connectionAppearances.get(id)!;
      const sourceOffset = state.previews.get(connection.source.nodeId),
        targetOffset = state.previews.get(connection.target.nodeId);
      if (sourceOffset || targetOffset) {
        const sourcePort = state.geometry.nodes.get(connection.source.nodeId)!
          .ports.find((p) => p.definition.id === connection.source.portId)!;
        const targetPort = state.geometry.nodes.get(connection.target.nodeId)!
          .ports.find((p) => p.definition.id === connection.target.portId)!;
        edge = routeConnection(
          edgeCurve(
            id,
            {
              x: sourcePort.point.x + (sourceOffset?.x ?? 0),
              y: sourcePort.point.y + (sourceOffset?.y ?? 0),
            },
            {
              x: targetPort.point.x + (targetOffset?.x ?? 0),
              y: targetPort.point.y + (targetOffset?.y ?? 0),
            },
            sourcePort.definition.side ?? "right",
            targetPort.definition.side ?? "left",
            edge.dataType,
          ),
          appearance,
          connection,
        );
      }
      if (v.scale < 0.45 && !appearance.draw && this.painter.connectionBatch) {
        const style = appearance.style,
          selected = state.selection.connections.includes(id),
          hovered = state.hoveredConnection === id;
        const color = selected || hovered
          ? style.activeColor ?? t.accent
          : style.color ?? t.portColors[edge.dataType] ?? t.portColors.any;
        const width = (selected
          ? style.selectedWidth
          : hovered
          ? style.hoverWidth
          : style.width) / Math.max(0.65, v.scale);
        const key = JSON.stringify([color, width, style.opacity, style.dash]);
        let batch = edgeBatches.get(key);
        if (!batch) {
          batch = {
            color,
            width,
            opacity: style.opacity,
            dash: style.dash,
            curves: [],
          };
          edgeBatches.set(key, batch);
        }
        batch.curves.push(edge);
      } else this.connection(edge, connection, appearance, state);
    }
    for (const batch of edgeBatches.values()) {
      this.isolated(() => this.painter.connectionBatch?.(canvasView, batch));
    }
    if (state.pending) {
      const port = state.geometry.nodes.get(state.pending.nodeId)?.ports.find(
        (p) => p.definition.id === state.pending!.portId,
      );
      if (port) {
        const candidate = state.hoveredPort ?? state.focusedPort;
        const compatibility = candidate
          ? state.connectionTargets.get(
            JSON.stringify([candidate.nodeId, candidate.portId]),
          ) ?? "none"
          : "none";
        const target = candidate && compatibility === "valid"
          ? state.geometry.nodes.get(candidate.nodeId)?.ports.find((p) =>
            p.definition.id === candidate.portId
          )
          : undefined;
        const output = port.definition.direction === "output";
        const point = target?.point ?? state.pending.point;
        const appearance = state.geometry.pendingAppearance;
        const curve = routeConnection(
          edgeCurve(
            "",
            output ? port.point : point,
            output ? point : port.point,
            output
              ? port.definition.side ?? "right"
              : target?.definition.side ?? "right",
            output
              ? target?.definition.side ?? "left"
              : port.definition.side ?? "left",
            port.definition.dataType,
          ),
          appearance,
          null,
        );
        this.connection(curve, null, appearance, state, compatibility);
      }
    }
    const visibleNodes = new Set([
      ...state.geometry.nodeIndex.query(visible),
      ...state.previews.keys(),
    ]);
    const sorted = [...visibleNodes].sort(
      (a, b) =>
        Number(state.selection.nodes.includes(a)) -
          Number(state.selection.nodes.includes(b)) || a.localeCompare(b),
    );
    for (const id of sorted) {
      const layout = state.geometry.nodes.get(id);
      if (!layout) continue;
      ctx.save();
      const offset = state.previews.get(id);
      if (offset) ctx.translate(offset.x, offset.y);
      this.node(layout, state);
      ctx.restore();
      // Keep a requested backdrop current for subsequent painters, in paint order.
      if (this.backdropReady && this.backdrop) {
        const b = layout.bounds;
        const margin = Math.max(64, layout.appearance.style.shadowBlur * 2);
        const x = Math.max(
          0,
          ((b.x + (offset?.x ?? 0) - margin) * v.scale + v.x) * state.ratio,
        );
        const y = Math.max(
          0,
          ((b.y + (offset?.y ?? 0) - margin) * v.scale + v.y) * state.ratio,
        );
        const right = Math.min(
          ctx.canvas.width,
          ((b.x + (offset?.x ?? 0) + b.width + margin) * v.scale + v.x) *
            state.ratio,
        );
        const bottom = Math.min(
          ctx.canvas.height,
          ((b.y + (offset?.y ?? 0) + b.height + margin) * v.scale + v.y) *
            state.ratio,
        );
        if (right > x && bottom > y) {
          this.backdrop.getContext("2d")!.drawImage(
            ctx.canvas,
            x,
            y,
            right - x,
            bottom - y,
            x,
            y,
            right - x,
            bottom - y,
          );
        }
      }
    }
    ctx.restore();
    this.isolated(() =>
      this.painter.overlay?.(canvasView, {
        marquee: state.marquee,
        empty: !state.geometry.nodes.size,
        menu: state.menu,
      })
    );
    this.transitions.end();
    return this.transitions.active || this.running;
  }
  private node(layout: NodeLayout, state: RenderState) {
    const { node, appearance: a } = layout;
    const motion = state.reducedMotion ? false : a.motion;
    const selected = state.selection.nodes.includes(node.id);
    const hovered = state.hovered === node.id;
    const dragging = state.previews.has(node.id);
    const progress = {
      hover: this.transitions.value(
        `${node.id}:hover`,
        +hovered,
        state.now,
        motion,
      ),
      selection: this.transitions.value(
        `${node.id}:selection`,
        +selected,
        state.now,
        motion,
      ),
      drag: this.transitions.value(
        `${node.id}:drag`,
        +dragging,
        state.now,
        motion,
      ),
    };
    const detail = state.viewport.scale < 0.15
      ? "overview"
      : state.viewport.scale < 0.45
      ? "compact"
      : "full";
    const view: NodeDrawContext = {
      context: this.ctx,
      node,
      geometry: layout,
      theme: a.theme,
      style: a.style,
      result: state.results.get(node.id),
      selected,
      hovered,
      dragging,
      progress,
      pointer: state.pointer,
      detail,
      presentation: layout.presentation,
      scale: state.viewport.scale,
      pixelRatio: state.ratio,
      offset: state.previews.get(node.id) ?? { x: 0, y: 0 },
      now: state.now,
      motion,
      transition: (channel, target) =>
        this.transitions.value(
          `${node.id}:${channel}`,
          target,
          state.now,
          motion,
        ),
      requestFrame: () => {
        if (motion) this.running = true;
      },
      getBackdrop: () => this.getBackdrop(),
      getControlPainter: (id) => {
        const definition = layout.controls.find((item) =>
          item.definition.id === id
        )?.definition;
        return definition &&
          (definition.draw ?? state.custom.get(definition.kind)?.draw);
      },
      getControlState: (id) => {
        const control = layout.controls.find((item) =>
          item.definition.id === id
        );
        return control ? this.controlState(layout, control, state) : undefined;
      },
    };
    const defaults = (
      parts: readonly NodeRenderPart[] = [
        "surface",
        "header",
        "body",
        "ports",
        "status",
      ],
    ) => {
      for (const part of parts) {
        this.ctx.save();
        try {
          if (part === "ports") this.ports(view, layout, state);
          else this.painter.node?.(view, part);
        } finally {
          this.ctx.restore();
        }
      }
    };
    this.ctx.save();
    try {
      if (a.draw) a.draw(view, defaults);
      else defaults();
    } finally {
      this.ctx.restore();
    }
  }
  private connection(
    geometry: ReturnType<typeof edgeCurve>,
    connection: DeepReadonly<ConnectionRecord> | null,
    appearance: ResolvedConnectionAppearance,
    state: RenderState,
    compatibility: PortCompatibility = "none",
  ) {
    const ctx = this.ctx, s = appearance.style, t = state.theme;
    const selected = !!connection &&
      state.selection.connections.includes(connection.id);
    const hovered = !!connection && state.hoveredConnection === connection.id;
    const running = !!connection &&
      (state.results.get(connection.source.nodeId)?.status === "running" ||
        state.results.get(connection.target.nodeId)?.status === "running");
    const motion = state.reducedMotion ? false : appearance.motion;
    const key = JSON.stringify(["connection", connection?.id ?? null]);
    const progress = {
      hover: this.transitions.value(
        `${key}:hover`,
        +hovered,
        state.now,
        motion,
      ),
      selection: this.transitions.value(
        `${key}:selection`,
        +selected,
        state.now,
        motion,
      ),
    };
    const typeColor = t.portColors[geometry.dataType] ?? t.portColors.any;
    const color = compatibility === "invalid"
      ? s.invalidColor ?? t.danger
      : selected
      ? s.activeColor ?? t.accent
      : s.color ?? typeColor;
    const detail = state.viewport.scale < 0.15
      ? "overview"
      : state.viewport.scale < 0.45
      ? "compact"
      : "full";
    const moving = running && s.opacity > 0 && !!motion &&
      motion.flowSpeed > 0 &&
      s.flowWidth > 0 && s.flowLength > 0 && detail === "full";
    const view: ConnectionDrawContext = {
      context: ctx,
      connection,
      geometry,
      style: s,
      theme: t,
      color,
      targetColor: selected || compatibility === "invalid"
        ? color
        : s.targetColor ?? color,
      selected,
      hovered,
      pending: !connection,
      running,
      compatibility,
      progress,
      flowOffset: moving ? state.now / 1000 * motion.flowSpeed : 0,
      detail,
      scale: state.viewport.scale,
    };
    ctx.save();
    try {
      let flowing = false;
      const defaults = (
        parts: readonly ConnectionRenderPart[] = [
          "outline",
          "line",
          "flow",
          "label",
        ],
      ) => {
        if (this.painter.connection && parts.includes("flow")) flowing = true;
        this.isolated(() => this.painter.connection?.(view, parts));
      };
      if (appearance.draw) appearance.draw(view, defaults);
      else defaults();
      if (moving && (flowing || appearance.draw)) this.running = true;
    } finally {
      ctx.restore();
    }
  }
  private ports(view: NodeDrawContext, layout: NodeLayout, state: RenderState) {
    const ctx = this.ctx, t = view.theme;
    for (const port of layout.ports) {
      const appearance = layout.portAppearances.get(port.definition.id)!;
      const s = appearance.style, p = port.point;
      const matches = (endpoint: Endpoint | null) =>
        endpoint?.nodeId === view.node.id &&
        endpoint.portId === port.definition.id;
      const hovered = matches(state.hoveredPort),
        focused = matches(state.focusedPort),
        connecting = matches(state.pending);
      const key = JSON.stringify(["port", view.node.id, port.definition.id]);
      const compatibility = state.connectionTargets.get(
        JSON.stringify([view.node.id, port.definition.id]),
      ) ?? "none";
      const motion = state.reducedMotion ? false : appearance.motion;
      const progress = {
        hover: this.transitions.value(
          `${key}:hover`,
          +(hovered || focused),
          state.now,
          motion,
        ),
        connection: this.transitions.value(
          `${key}:connection`,
          +(!!port.connected || connecting),
          state.now,
          motion,
        ),
        active: this.transitions.value(
          `${key}:active`,
          connecting ? 1 : compatibility === "valid" ? 0.5 : 0,
          state.now,
          motion,
        ),
      };
      const color = compatibility === "invalid" && (hovered || focused)
        ? s.invalidColor ?? t.danger
        : connecting || focused
        ? s.activeColor ?? t.accent
        : s.color ?? t.portColors[port.definition.dataType] ?? t.portColors.any;
      const side = port.definition.side ??
        (port.definition.direction === "input" ? "left" : "right");
      const portView: PortDrawContext = {
        context: ctx,
        node: view.node,
        geometry: layout,
        port,
        point: p,
        side,
        style: s,
        theme: t,
        color,
        connected: !!port.connected,
        hovered,
        focused,
        connecting,
        compatibility,
        progress,
        detail: view.detail,
      };
      ctx.save();
      try {
        const defaults = (
          parts: readonly PortRenderPart[] = [
            "halo",
            "socket",
            "core",
            "indicator",
            "label",
          ],
        ) => this.isolated(() => this.painter.port?.(portView, parts, view));
        if (appearance.draw) appearance.draw(portView, defaults);
        else defaults();
      } finally {
        ctx.restore();
      }
    }
  }
  private controlState(
    layout: NodeLayout,
    control: ControlLayout,
    state: RenderState,
  ) {
    const d = control.definition, key = `${layout.node.id}:${d.id}`;
    const editing = state.editing?.nodeId === layout.node.id &&
        state.editing.controlId === d.id
      ? state.editing
      : null;
    return {
      value: editing
        ? editing.value
        : state.values.has(key)
        ? state.values.get(key)
        : layout.node.data[d.key ?? d.id] as JsonValue | undefined,
      focused: !!editing || state.focusedControl === key,
      disabled: !!d.disabled,
      editing: editing ? { ...editing } : null,
      caret: state.caret,
    };
  }
}
