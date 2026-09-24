import { uniqueId } from "../core/index.ts";
import type {
  DeepReadonly,
  Endpoint,
  GraphDocument,
  GraphFragment,
  GraphRecord,
  JsonValue,
  Point,
  Rect,
} from "../core/index.ts";
import type { NodeResult } from "../runtime/types.ts";
import type { LayoutInput } from "../layout/types.ts";
import { buildGeometry, distanceToCurve } from "./geometry.ts";
import type { ControlLayout, NodeLayout, SceneGeometry } from "./geometry.ts";
import { CanvasRenderer } from "./renderer.ts";
import type { CanvasMenu, TextEditState } from "./renderer.ts";
import { contains, intersects, union } from "./spatial.ts";
import { TextInputBridge } from "./textInput.ts";
import type {
  ConnectionAppearance,
  CustomControl,
  EditorCommand,
  EditorEvent,
  EditorExtension,
  EditorInterface,
  EditorOptions,
  NodeAppearance,
  NodePresentation,
  PortAppearance,
  PortCompatibility,
  Selection,
  Theme,
  Viewport,
} from "./types.ts";

type Hit =
  | { kind: "port"; nodeId: string; portId: string }
  | { kind: "control"; nodeId: string; control: ControlLayout }
  | { kind: "node" | "header" | "menu"; nodeId: string }
  | { kind: "edge" | "group"; id: string };
type Gesture =
  | { kind: "pan"; start: Point; viewport: Viewport }
  | { kind: "move"; start: Point; positions: Record<string, Point> }
  | { kind: "marquee"; start: Point; additive: boolean }
  | { kind: "slider"; nodeId: string; control: ControlLayout };
interface Pending {
  nodeId: string;
  portId: string;
  point: Point;
  reconnect?: string;
}

/** Browser editor; persistent mutations cross GraphDocument's command interface. */
export class Editor implements EditorInterface {
  readonly document: GraphDocument;
  readonly canvas: HTMLCanvasElement;
  readonly theme: Theme;
  private currentGraphId: string;
  private scene!: SceneGeometry;
  private renderer: CanvasRenderer;
  private presentations = new Map<string, NodePresentation>();
  private custom = new Map<string, CustomControl>();
  private commands = new Map<string, EditorCommand>();
  private selection: Selection = { nodes: [], connections: [], groups: [] };
  private viewport: Viewport;
  private previews = new Map<string, Point>();
  private values = new Map<string, JsonValue>();
  private results = new Map<string, NodeResult>();
  private pending: Pending | null = null;
  private gesture: Gesture | null = null;
  private pointers = new Map<number, Point>();
  private pinch: { distance: number; world: Point; scale: number } | null =
    null;
  private marquee: Rect | null = null;
  private menu: CanvasMenu | null = null;
  private hovered: string | null = null;
  private hoveredPort: Endpoint | null = null;
  private focusedPort: Endpoint | null = null;
  private hoveredConnection: string | null = null;
  private targetCache?: {
    scene: SceneGeometry;
    pending: Pending;
    values: Map<string, PortCompatibility>;
  };
  private pointer: Point | null = null;
  private reducedMotion = false;
  private focusedControl: string | null = null;
  private editing: TextEditState | null = null;
  private bridge: TextInputBridge;
  private semantics: HTMLElement;
  private menuSemantics: HTMLElement;
  private frame: number | null = null;
  private caretTimer: ReturnType<typeof setInterval> | null = null;
  private longPress: ReturnType<typeof setTimeout> | null = null;
  private caret = true;
  private destroyed = false;
  private space = false;
  private selectionMode = false;
  private touch: boolean;
  private width = 0;
  private height = 0;
  private ratio = 1;
  private cleanups: (() => void)[] = [];
  private listeners = new Set<(event: EditorEvent) => void>();
  private resizeObserver?: ResizeObserver;
  private clipboard: GraphFragment | null = null;
  private originalPosition: string;
  private originalTouchAction: string;
  private frames = 0;
  private lastDuration = 0;

  constructor(
    private container: HTMLElement,
    private options: EditorOptions,
  ) {
    if (!options.preset || typeof options.preset.createPainter !== "function") {
      throw new Error(
        "Editor requires an explicit preset. Import defaultPreset from nodeflow/presets, or supply your own.",
      );
    }
    if (
      ![options.preset.menu.rowHeight, options.preset.menu.touchRowHeight]
        .every((n) => Number.isFinite(n) && n > 0)
    ) {
      throw new Error(
        "Preset menu row heights must be finite, positive numbers",
      );
    }
    this.document = options.document;
    this.currentGraphId = this.document.snapshot().rootGraphId;
    this.theme = {
      ...options.preset.theme,
      ...options.theme,
      portColors: {
        ...options.preset.theme.portColors,
        ...options.theme?.portColors,
      },
    };
    this.viewport = { x: 0, y: 0, scale: 1, ...options.viewport };
    this.validateViewport(this.viewport);
    this.touch = options.touch ??
      (typeof matchMedia === "function" &&
        matchMedia("(pointer: coarse)").matches);
    for (const extension of options.extensions ?? []) this.install(extension);
    // Validate user appearance/layout callbacks before changing the host or subscribing.
    this.scene = buildGeometry(
      this.document,
      this.graph,
      this.presentations,
      this.custom,
      this.touch,
      this.theme,
      this.options,
    );
    this.originalPosition = container.style.position;
    this.originalTouchAction = container.style.touchAction;
    this.canvas = document.createElement("canvas");
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("role", "application");
    this.canvas.setAttribute(
      "aria-label",
      "Nodeflow graph editor. Tab to navigate nodes and controls.",
    );
    Object.assign(this.canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
      position: "absolute",
      inset: "0",
      touchAction: "none",
      outline: "none",
    });
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is required");
    this.renderer = new CanvasRenderer(
      context,
      options.preset.createPainter(context),
    );
    const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion = motionPreference.matches;
    const updateMotion = () => {
      this.reducedMotion = motionPreference.matches;
      this.invalidate();
    };
    motionPreference.addEventListener("change", updateMotion);
    this.cleanups.push(() =>
      motionPreference.removeEventListener("change", updateMotion)
    );
    this.semantics = document.createElement("div");
    this.semantics.setAttribute("role", "region");
    this.semantics.setAttribute("aria-label", "Graph navigation and controls");
    this.menuSemantics = document.createElement("div");
    for (const element of [this.semantics, this.menuSemantics]) {
      Object.assign(element.style, {
        position: "absolute",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        clipPath: "inset(50%)",
        whiteSpace: "nowrap",
      });
    }
    if (!container.style.position || container.style.position === "static") {
      container.style.position = "relative";
    }
    container.append(this.canvas, this.semantics, this.menuSemantics);
    this.bridge = new TextInputBridge(container, (state) => {
      this.editing = state;
      this.caret = true;
      if (state && this.caretTimer === null) {
        this.caretTimer = setInterval(() => {
          this.caret = !this.caret;
          this.invalidate();
        }, 500);
      }
      if (!state && this.caretTimer !== null) {
        clearInterval(this.caretTimer);
        this.caretTimer = null;
      }
      this.invalidate();
    });
    this.cleanups.push(
      this.document.subscribe(() => {
        if (!this.document.snapshot().graphs[this.currentGraphId]) {
          this.currentGraphId = this.document.snapshot().rootGraphId;
          this.emit({ type: "graph" });
        }
        this.previews.clear();
        this.gesture = null;
        this.rebuild();
      }),
    );
    this.bindInput();
    this.updateSemantics();
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
  }
  get graphId(): string {
    return this.currentGraphId;
  }
  private get graph(): DeepReadonly<GraphRecord> {
    return this.document.snapshot().graphs[this.currentGraphId];
  }
  get metrics() {
    return {
      frames: this.frames,
      lastRenderDuration: this.lastDuration,
      nodeCount: this.scene.nodes.size,
    };
  }
  get isTouch(): boolean {
    return this.touch;
  }
  on(listener: (event: EditorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(event: EditorEvent) {
    for (const listener of this.listeners) listener(event);
  }
  private alive() {
    if (this.destroyed) throw new Error("Editor has been destroyed");
  }
  private attempt(action: () => void) {
    try {
      action();
    } catch (error) {
      this.reportError(error instanceof Error ? error.message : String(error));
    }
  }
  reportError(message: string) {
    this.options.onError?.(message);
    this.emit({ type: "error", message });
  }
  private install(extension: EditorExtension) {
    for (
      const [items, existing] of [
        [extension.presentations, this.presentations],
        [extension.controls, this.custom],
        [extension.commands, this.commands],
      ] as const
    ) {
      const seen = new Set<string>();
      for (const item of items ?? []) {
        const id = "type" in item
          ? item.type
          : "kind" in item
          ? item.kind
          : item.id;
        if (existing.has(id) || seen.has(id)) {
          throw new Error(`Duplicate extension entry: ${id}`);
        }
        seen.add(id);
      }
    }
    for (const presentation of extension.presentations ?? []) {
      if (this.presentations.has(presentation.type)) {
        throw new Error(`Duplicate presentation: ${presentation.type}`);
      }
      this.presentations.set(presentation.type, presentation);
    }
    for (const control of extension.controls ?? []) {
      if (this.custom.has(control.kind)) {
        throw new Error(`Duplicate control: ${control.kind}`);
      }
      this.custom.set(control.kind, control);
    }
    for (const command of extension.commands ?? []) {
      if (this.commands.has(command.id)) {
        throw new Error(`Duplicate command: ${command.id}`);
      }
      this.commands.set(command.id, command);
    }
  }
  use(extension: EditorExtension) {
    this.alive();
    this.install(extension);
    this.rebuild();
  }
  /** Replaces editor defaults; type and instance overrides still apply. Returns false if invalid text prevents the change. */
  setNodeAppearance(appearance: NodeAppearance): boolean {
    this.alive();
    this.bridge.blur();
    if (this.bridge.active) return false;
    const previous = this.options.nodes;
    this.options = { ...this.options, nodes: appearance };
    try {
      this.rebuild();
    } catch (error) {
      this.options = { ...this.options, nodes: previous };
      throw error;
    }
    return true;
  }
  /** Replaces connection defaults without modifying the graph or undo history. */
  setConnectionAppearance(appearance: ConnectionAppearance) {
    this.setLinkAppearance("connections", appearance);
  }
  /** Replaces port defaults; node and per-port overrides continue to apply. */
  setPortAppearance(appearance: PortAppearance) {
    this.setLinkAppearance("ports", appearance);
  }
  private setLinkAppearance(
    key: "ports" | "connections",
    appearance: PortAppearance | ConnectionAppearance,
  ) {
    this.alive();
    const previous = this.options;
    this.options = { ...previous, [key]: appearance };
    try {
      this.rebuild();
    } catch (error) {
      this.options = previous;
      throw error;
    }
  }
  /** Same type, multiplicity and duplicate rules as document validation; no speculative mutations. */
  private connectionTargets(): Map<string, PortCompatibility> {
    if (!this.pending) {
      this.targetCache = undefined;
      return new Map();
    }
    if (
      this.targetCache?.scene === this.scene &&
      this.targetCache.pending === this.pending
    ) return this.targetCache.values;
    const pending = this.pending;
    const origin = this.scene.nodes.get(pending.nodeId)?.ports.find((p) =>
      p.definition.id === pending.portId
    );
    const values = new Map<string, PortCompatibility>();
    if (origin) {
      const edges = Object.values(this.graph.connections).filter((e) =>
        e.id !== pending.reconnect
      );
      const occupied = new Set(
        edges.map((e) => JSON.stringify([e.target.nodeId, e.target.portId])),
      );
      const pairs = new Set(
        edges.map((e) =>
          JSON.stringify([
            e.source.nodeId,
            e.source.portId,
            e.target.nodeId,
            e.target.portId,
          ])
        ),
      );
      for (const layout of this.scene.nodes.values()) {
        for (const port of layout.ports) {
          const key = JSON.stringify([layout.node.id, port.definition.id]);
          if (
            pending.nodeId === layout.node.id &&
            pending.portId === port.definition.id
          ) {
            values.set(key, "none");
            continue;
          }
          const output = origin.definition.direction === "output";
          const source = output ? origin : port,
            target = output ? port : origin;
          const sourceNode = output ? pending.nodeId : layout.node.id;
          const targetNode = output ? layout.node.id : pending.nodeId;
          const valid = this.document.registry.compatible(
            source.definition,
            target.definition,
          ) &&
            (target.definition.multiple ||
              !occupied.has(
                JSON.stringify([targetNode, target.definition.id]),
              )) &&
            !pairs.has(
              JSON.stringify([
                sourceNode,
                source.definition.id,
                targetNode,
                target.definition.id,
              ]),
            );
          values.set(key, valid ? "valid" : "invalid");
        }
      }
    }
    this.targetCache = { scene: this.scene, pending, values };
    return values;
  }
  executeCommand(id: string) {
    this.alive();
    const command = this.commands.get(id);
    if (!command) throw new Error(`Unknown command: ${id}`);
    command.run(this);
  }
  private rebuild() {
    this.scene = buildGeometry(
      this.document,
      this.graph,
      this.presentations,
      this.custom,
      this.touch,
      this.theme,
      this.options,
    );
    this.selection.nodes = this.selection.nodes.filter((id) =>
      this.scene.nodes.has(id)
    );
    this.selection.connections = this.selection.connections.filter((id) =>
      this.scene.edges.has(id)
    );
    this.selection.groups = this.selection.groups.filter((id) =>
      this.scene.groups.has(id)
    );
    if (this.editing && !this.scene.nodes.has(this.editing.nodeId)) {
      this.bridge.close();
    }
    if (
      this.pending &&
      !this.scene.nodes
        .get(this.pending.nodeId)
        ?.ports.some((port) => port.definition.id === this.pending!.portId)
    ) {
      this.pending = null;
    }
    this.updateSemantics();
    this.invalidate();
    this.emit({ type: "selection" });
  }
  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, listener, options);
    this.cleanups.push(() =>
      target.removeEventListener(type, listener, options)
    );
  }
  private bindInput() {
    this.listen(this.canvas, "pointerleave", () => {
      this.hovered = null;
      this.hoveredPort = null;
      this.hoveredConnection = null;
      this.invalidate();
    });
    this.listen(document, "visibilitychange", () => this.invalidate());
    this.listen(
      this.canvas,
      "pointerdown",
      (event) => this.attempt(() => this.pointerDown(event as PointerEvent)),
    );
    this.listen(
      window,
      "pointermove",
      (event) => this.attempt(() => this.pointerMove(event as PointerEvent)),
    );
    this.listen(
      window,
      "pointerup",
      (event) => this.attempt(() => this.pointerUp(event as PointerEvent)),
    );
    this.listen(this.canvas, "pointercancel", () => this.cancelGesture());
    this.listen(this.canvas, "lostpointercapture", (event) => {
      const pointer = event as PointerEvent;
      if (!this.pointers.has(pointer.pointerId)) return;
      // Some hosts release capture before delivering pointerup. With no buttons
      // pressed this is a drop, not a cancellation; the later pointerup is ignored.
      if (pointer.buttons === 0) this.attempt(() => this.pointerUp(pointer));
      else this.cancelGesture();
    });
    this.listen(window, "blur", () => {
      this.space = false;
      this.cancelGesture();
    });
    this.listen(this.canvas, "contextmenu", (event) => {
      event.preventDefault();
      const point = this.local(event as MouseEvent);
      this.contextMenu(point);
    });
    this.listen(this.canvas, "dblclick", (event) => {
      const hit = this.hit(this.toWorld(this.local(event as MouseEvent)));
      if (
        hit &&
        "nodeId" in hit &&
        this.graph.nodes[hit.nodeId].type === "@subgraph"
      ) {
        this.openGraph(this.graph.nodes[hit.nodeId].subgraphId!);
      }
    });
    this.listen(
      this.canvas,
      "wheel",
      (event) => {
        const wheel = event as WheelEvent;
        wheel.preventDefault();
        if (this.menu) {
          const menu = this.menu;
          menu.offset = Math.max(
            0,
            Math.min(
              menu.items.length - menu.visibleCount,
              menu.offset + Math.sign(wheel.deltaY),
            ),
          );
          this.invalidate();
          return;
        }
        this.closeMenu();
        if (wheel.shiftKey) {
          this.setViewport({
            x: this.viewport.x - wheel.deltaY,
            y: this.viewport.y - wheel.deltaX,
          });
        } else {
          this.zoomAt(
            this.local(wheel),
            this.viewport.scale *
              Math.exp(-wheel.deltaY * (wheel.deltaMode === 1 ? 0.035 : 0.002)),
          );
        }
      },
      { passive: false },
    );
    this.listen(
      this.container,
      "keydown",
      (event) => this.attempt(() => this.keyDown(event as KeyboardEvent)),
    );
    this.listen(window, "keyup", (event) => {
      if ((event as KeyboardEvent).code === "Space") this.space = false;
    });
    this.listen(
      this.container,
      "copy",
      (event) => this.copyEvent(event as ClipboardEvent, false),
    );
    this.listen(
      this.container,
      "cut",
      (event) => this.copyEvent(event as ClipboardEvent, true),
    );
    this.listen(
      this.container,
      "paste",
      (event) => this.pasteEvent(event as ClipboardEvent),
    );
    this.listen(document, "pointerdown", (event) => {
      if (!this.container.contains(event.target as globalThis.Node)) {
        this.closeMenu();
      }
    });
    this.listen(window, "resize", () => this.resize());
    if (globalThis.visualViewport) {
      this.listen(
        globalThis.visualViewport,
        "resize",
        () => this.keepEditingVisible(),
      );
      this.listen(
        globalThis.visualViewport,
        "scroll",
        () => this.keepEditingVisible(),
      );
    }
  }
  private resize() {
    if (this.destroyed) return;
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(0, rect.width);
    this.height = Math.max(0, rect.height);
    this.ratio = Math.min(3, globalThis.devicePixelRatio || 1);
    const width = Math.round(this.width * this.ratio),
      height = Math.round(this.height * this.ratio);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.positionInput();
    this.invalidate();
  }
  private invalidate() {
    if (!this.destroyed && this.frame === null) {
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.render();
      });
    }
  }
  render() {
    if (this.destroyed || !this.scene) return;
    const started = performance.now();
    const animating = this.renderer.render({
      graph: this.graph,
      geometry: this.scene,
      viewport: this.viewport,
      selection: this.selection,
      previews: this.previews,
      values: this.values,
      results: this.results,
      custom: this.custom,
      pending: this.pending,
      hovered: this.hovered,
      hoveredPort: this.hoveredPort,
      focusedPort: this.focusedPort,
      hoveredConnection: this.hoveredConnection,
      connectionTargets: this.connectionTargets(),
      pointer: this.pointer,
      reducedMotion: this.reducedMotion || document.hidden,
      now: started,
      focusedControl: this.focusedControl,
      marquee: this.marquee,
      editing: this.editing,
      caret: this.caret,
      menu: this.menu,
      width: this.width,
      height: this.height,
      ratio: this.ratio,
      theme: this.theme,
      touch: this.touch,
    });
    this.lastDuration = performance.now() - started;
    this.frames++;
    this.emit({ type: "render", duration: this.lastDuration });
    if (animating && !document.hidden) this.invalidate();
  }
  getSelection(): Selection {
    return {
      nodes: [...this.selection.nodes],
      connections: [...this.selection.connections],
      groups: [...this.selection.groups],
    };
  }
  setSelection(selection: Partial<Selection>) {
    this.alive();
    this.selection = {
      nodes: [...new Set(selection.nodes ?? [])].filter((id) =>
        this.scene.nodes.has(id)
      ),
      connections: [...new Set(selection.connections ?? [])].filter((id) =>
        this.scene.edges.has(id)
      ),
      groups: [...new Set(selection.groups ?? [])].filter((id) =>
        this.scene.groups.has(id)
      ),
    };
    this.updateSemantics();
    this.invalidate();
    this.emit({ type: "selection" });
  }
  getViewport(): Viewport {
    return { ...this.viewport };
  }
  private validateViewport(viewport: Viewport) {
    if (
      ![viewport.x, viewport.y, viewport.scale].every(Number.isFinite) ||
      viewport.scale <= 0
    ) {
      throw new Error(
        "Viewport must have finite coordinates and positive scale",
      );
    }
  }
  setViewport(update: Partial<Viewport>) {
    this.alive();
    const next = { ...this.viewport, ...update };
    this.validateViewport(next);
    next.scale = Math.min(4, Math.max(0.01, next.scale));
    this.viewport = next;
    this.positionInput();
    this.invalidate();
    this.emit({ type: "viewport" });
  }
  toWorld(point: Point): Point {
    return {
      x: (point.x - this.viewport.x) / this.viewport.scale,
      y: (point.y - this.viewport.y) / this.viewport.scale,
    };
  }
  toScreen(point: Point): Point {
    return {
      x: point.x * this.viewport.scale + this.viewport.x,
      y: point.y * this.viewport.scale + this.viewport.y,
    };
  }
  private local(event: { clientX: number; clientY: number }): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  zoomAt(point: Point, scale: number) {
    const world = this.toWorld(point),
      next = Math.min(4, Math.max(0.01, scale));
    this.setViewport({
      scale: next,
      x: point.x - world.x * next,
      y: point.y - world.y * next,
    });
  }
  fitView(nodeIds?: readonly string[]) {
    this.alive();
    const rects = [...this.scene.nodes.values()]
      .filter((layout) => !nodeIds || nodeIds.includes(layout.node.id))
      .map((layout) => layout.bounds);
    if (!rects.length || !this.width || !this.height) {
      this.setViewport({ x: 0, y: 0, scale: 1 });
      return;
    }
    const b = union(rects),
      padding = this.touch ? 28 : 40,
      scale = Math.min(
        1,
        Math.max(
          0.01,
          Math.min(
            (this.width - padding * 2) / Math.max(1, b.width),
            (this.height - padding * 2) / Math.max(1, b.height),
          ),
        ),
      );
    this.setViewport({
      scale,
      x: (this.width - b.width * scale) / 2 - b.x * scale,
      y: (this.height - b.height * scale) / 2 - b.y * scale,
    });
  }
  focusNode(id: string) {
    this.alive();
    const layout = this.scene.nodes.get(id);
    if (!layout) return;
    this.setSelection({ nodes: [id] });
    const b = layout.bounds,
      scale = this.touch ? 1 : Math.max(0.8, this.viewport.scale);
    this.setViewport({
      scale,
      x: (this.width - b.width * scale) / 2 - b.x * scale,
      y: Math.max(20, (this.height - b.height * scale) / 2) - b.y * scale,
    });
  }
  getNodeBounds(id: string): Rect | undefined {
    const rect = this.scene.nodes.get(id)?.bounds;
    return rect ? { ...rect } : undefined;
  }
  getControlBounds(nodeId: string, controlId: string): Rect | undefined {
    const bounds = this.scene.nodes.get(nodeId)?.controls.find((control) =>
      control.definition.id === controlId
    )?.bounds;
    return bounds ? { ...bounds } : undefined;
  }
  getPortPosition(nodeId: string, portId: string): Point | undefined {
    const point = this.scene.nodes.get(nodeId)?.ports.find((port) =>
      port.definition.id === portId
    )?.point;
    return point ? { ...point } : undefined;
  }
  getLayoutInput(): LayoutInput {
    return {
      nodes: [...this.scene.nodes.values()].map((layout) => ({
        id: layout.node.id,
        width: layout.bounds.width,
        height: layout.bounds.height,
      })),
      edges: Object.values(this.graph.connections).map((edge) => ({
        id: edge.id,
        source: edge.source.nodeId,
        target: edge.target.nodeId,
      })),
      groups: Object.values(this.graph.groups).map((group) => ({
        id: group.id,
        nodeIds: [...group.nodeIds],
        ...(group.parentId ? { parentId: group.parentId } : {}),
      })),
    };
  }
  setRuntimeState(
    nodes: Readonly<Record<string, NodeResult>>,
    path: readonly string[] = [],
  ) {
    this.alive();
    this.results.clear();
    for (const result of Object.values(nodes)) {
      if (
        result.path.length === path.length + 1 &&
        path.every((id, i) => result.path[i] === id)
      ) {
        this.results.set(result.path.at(-1)!, result);
      }
    }
    this.invalidate();
  }
  openGraph(graphId: string) {
    this.alive();
    if (!this.document.snapshot().graphs[graphId]) {
      throw new Error("Graph does not exist");
    }
    this.bridge.close();
    this.cancelGesture();
    this.closeMenu();
    this.pending = null;
    this.hoveredPort = this.focusedPort = null;
    this.hoveredConnection = null;
    this.targetCache = undefined;
    this.currentGraphId = graphId;
    this.selection = { nodes: [], connections: [], groups: [] };
    this.results.clear();
    this.renderer.resetMotion();
    this.rebuild();
    this.fitView();
    this.emit({ type: "graph" });
  }
  setSelectionMode(enabled: boolean) {
    this.selectionMode = enabled;
  }
  addNode(type: string): string {
    this.alive();
    const point = this.toWorld({ x: this.width / 2, y: this.height / 2 });
    const id = this.document.addNode(
      { type, position: { x: point.x - 120, y: point.y - 70 } },
      this.graphId,
    );
    this.setSelection({ nodes: [id] });
    return id;
  }
  private groupNodes(id: string): string[] {
    const group = this.graph.groups[id];
    return group
      ? [
        ...group.nodeIds,
        ...Object.values(this.graph.groups)
          .filter((child) => child.parentId === id)
          .flatMap((child) => this.groupNodes(child.id)),
      ]
      : [];
  }
  private selectedNodes(): string[] {
    return [
      ...new Set([
        ...this.selection.nodes,
        ...this.selection.groups.flatMap((id) => this.groupNodes(id)),
      ]),
    ];
  }
  deleteSelection() {
    this.alive();
    this.document.dispatch({
      type: "remove",
      graphId: this.graphId,
      nodeIds: this.selectedNodes(),
      connectionIds: this.selection.connections,
      groupIds: this.selection.groups,
    });
    this.setSelection({});
  }
  duplicateSelection() {
    this.alive();
    const ids = this.selectedNodes();
    if (ids.length) {
      this.setSelection({
        nodes: this.document.paste(
          this.document.copy(ids, this.graphId),
          this.graphId,
        ),
      });
    }
  }
  groupSelection() {
    this.alive();
    const ids = this.selectedNodes();
    if (!ids.length) return;
    const id = uniqueId("group");
    this.document.transaction("Group nodes", () => {
      for (const group of Object.values(this.graph.groups)) {
        if (group.nodeIds.some((member) => ids.includes(member))) {
          this.document.dispatch({
            type: "update-group",
            graphId: this.graphId,
            groupId: group.id,
            changes: {
              nodeIds: group.nodeIds.filter((member) => !ids.includes(member)),
            },
          });
        }
      }
      this.document.dispatch({
        type: "add-group",
        graphId: this.graphId,
        group: { id, label: "Group", nodeIds: ids },
      });
    });
    this.setSelection({ groups: [id] });
  }
  createSubgraph() {
    this.alive();
    const id = this.document.createSubgraph(this.selectedNodes(), this.graphId);
    this.setSelection({ nodes: [id] });
    return id;
  }
  private hit(point: Point): Hit | null {
    const radius = (this.touch ? 22 : 10) / this.viewport.scale;
    const candidates = this.scene.nodeIndex
      .query({
        x: point.x - radius,
        y: point.y - radius,
        width: radius * 2,
        height: radius * 2,
      })
      .sort(
        (a, b) =>
          Number(this.selection.nodes.includes(a)) -
            Number(this.selection.nodes.includes(b)) || a.localeCompare(b),
      )
      .reverse();
    for (const id of candidates) {
      const layout = this.scene.nodes.get(id)!;
      for (const port of layout.ports) {
        if (
          Math.hypot(point.x - port.point.x, point.y - port.point.y) <=
            Math.max(
              radius,
              Math.max(
                layout.portAppearances.get(port.definition.id)!.style.hitRadius,
                layout.portAppearances.get(port.definition.id)!.style.radius +
                  layout.portAppearances.get(port.definition.id)!.style.width,
              ),
            )
        ) {
          return { kind: "port", nodeId: id, portId: port.definition.id };
        }
      }
      if (contains(layout.bounds, point)) {
        if (this.viewport.scale >= 0.45) {
          for (const control of layout.controls) {
            if (contains(control.row, point)) {
              return { kind: "control", nodeId: id, control };
            }
          }
          if (
            contains(
              {
                x: layout.bounds.x + layout.bounds.width - 36,
                y: layout.bounds.y,
                width: 36,
                height: layout.header.height,
              },
              point,
            )
          ) {
            return { kind: "menu", nodeId: id };
          }
        }
        return {
          kind: contains(layout.header, point) ? "header" : "node",
          nodeId: id,
        };
      }
    }
    for (
      const id of this.scene.edgeIndex.query({
        x: point.x - radius,
        y: point.y - radius,
        width: radius * 2,
        height: radius * 2,
      })
    ) {
      if (
        distanceToCurve(point, this.scene.edges.get(id)!) <
          Math.max(
            radius * 0.6,
            this.scene.connectionAppearances.get(id)!.style.hitWidth / 2,
          )
      ) {
        return { kind: "edge", id };
      }
    }
    for (const [id, bounds] of [...this.scene.groups].reverse()) {
      if (contains({ ...bounds, height: 36 }, point)) {
        return { kind: "group", id };
      }
    }
    return null;
  }
  private pointerDown(event: PointerEvent) {
    if (![0, 1, 2].includes(event.button)) return;
    if (event.pointerType === "touch" && !this.touch) {
      this.touch = true;
      this.rebuild();
    }
    const point = this.local(event);
    if (this.menu && this.menuPointer(point, true)) {
      event.preventDefault();
      return;
    }
    this.closeMenu();
    this.bridge.blur();
    if (this.bridge.active) return;
    this.canvas.focus({ preventScroll: true });
    event.preventDefault();
    if (event.button === 2) {
      this.contextMenu(point);
      return;
    }
    this.pointers.set(event.pointerId, point);
    // Synthetic input and a pointer that ended between dispatch and handling may have no capture target.
    try {
      this.canvas.setPointerCapture?.(event.pointerId);
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") {
        throw error;
      }
    }
    if (this.pointers.size === 2) {
      this.previews.clear();
      this.values.clear();
      this.gesture = null;
      this.pending = null;
      this.clearLongPress();
      const [a, b] = [...this.pointers.values()],
        center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.pinch = {
        distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        world: this.toWorld(center),
        scale: this.viewport.scale,
      };
      return;
    }
    const world = this.toWorld(point),
      hit = this.hit(world);
    if (event.button === 1 || this.space) {
      this.gesture = {
        kind: "pan",
        start: point,
        viewport: this.getViewport(),
      };
      return;
    }
    if (event.pointerType === "touch") {
      this.longPress = setTimeout(() => {
        this.cancelGesture();
        this.contextMenu(point);
      }, 500);
    }
    if (hit?.kind === "port") {
      this.hoveredPort = { nodeId: hit.nodeId, portId: hit.portId };
      this.hoveredConnection = null;
      this.startOrFinishConnection(hit.nodeId, hit.portId, world);
      return;
    }
    if (this.pending) {
      this.pending = null;
      this.invalidate();
      return;
    }
    if (hit?.kind === "menu") {
      this.setSelection({ nodes: [hit.nodeId] });
      this.contextMenu(point);
      return;
    }
    if (hit?.kind === "control") {
      this.setSelection({ nodes: [hit.nodeId] });
      this.clearLongPress();
      if (this.viewport.scale < (this.touch ? 0.9 : 0.65)) {
        this.focusNode(hit.nodeId);
        return;
      }
      this.activateControl(hit.nodeId, hit.control, world);
      return;
    }
    if (hit && "nodeId" in hit) {
      if (event.shiftKey) {
        this.setSelection({
          nodes: this.selection.nodes.includes(hit.nodeId)
            ? this.selection.nodes.filter((id) => id !== hit.nodeId)
            : [...this.selection.nodes, hit.nodeId],
        });
      } else if (!this.selection.nodes.includes(hit.nodeId)) {
        this.setSelection({ nodes: [hit.nodeId] });
      }
      if (hit.kind === "header" || this.viewport.scale < 0.45) {
        this.gesture = {
          kind: "move",
          start: world,
          positions: Object.fromEntries(
            this.selectedNodes().map((id) => [
              id,
              { ...this.graph.nodes[id].position },
            ]),
          ),
        };
      }
    } else if (hit?.kind === "edge") {
      this.setSelection({
        connections: event.shiftKey
          ? [...this.selection.connections, hit.id]
          : [hit.id],
        ...(event.shiftKey ? { nodes: this.selection.nodes } : {}),
      });
    } else if (hit?.kind === "group") {
      this.setSelection({ groups: [hit.id] });
      this.gesture = {
        kind: "move",
        start: world,
        positions: Object.fromEntries(
          this.groupNodes(hit.id).map((id) => [
            id,
            { ...this.graph.nodes[id].position },
          ]),
        ),
      };
    } else if (this.touch && !this.selectionMode) {
      this.setSelection({});
      this.gesture = {
        kind: "pan",
        start: point,
        viewport: this.getViewport(),
      };
    } else {
      if (!event.shiftKey) this.setSelection({});
      this.gesture = {
        kind: "marquee",
        start: world,
        additive: event.shiftKey,
      };
      this.marquee = { ...world, width: 0, height: 0 };
    }
  }
  private pointerMove(event: PointerEvent) {
    if (this.destroyed) return;
    const point = this.local(event),
      previous = this.pointers.get(event.pointerId);
    if (previous) {
      this.pointers.set(event.pointerId, point);
      if (Math.hypot(point.x - previous.x, point.y - previous.y) > 3) {
        this.clearLongPress();
      }
    }
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()],
        center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        scale = Math.max(
          0.01,
          Math.min(
            4,
            (this.pinch.scale * Math.hypot(b.x - a.x, b.y - a.y)) /
              this.pinch.distance,
          ),
        );
      this.setViewport({
        scale,
        x: center.x - this.pinch.world.x * scale,
        y: center.y - this.pinch.world.y * scale,
      });
      return;
    }
    if (!previous && event.target !== this.canvas) return;
    if (this.menu) {
      this.menuPointer(point, false);
      return;
    }
    const world = this.toWorld(point);
    if (this.gesture?.kind === "pan") {
      this.setViewport({
        x: this.gesture.viewport.x + point.x - this.gesture.start.x,
        y: this.gesture.viewport.y + point.y - this.gesture.start.y,
      });
    } else if (this.gesture?.kind === "move") {
      const delta = this.nodeDragDelta(this.gesture, world, event.altKey);
      for (const id of Object.keys(this.gesture.positions)) {
        this.previews.set(id, delta);
      }
    } else if (this.gesture?.kind === "marquee") {
      this.marquee = {
        x: Math.min(world.x, this.gesture.start.x),
        y: Math.min(world.y, this.gesture.start.y),
        width: Math.abs(world.x - this.gesture.start.x),
        height: Math.abs(world.y - this.gesture.start.y),
      };
    } else if (this.gesture?.kind === "slider") {
      this.previewSlider(this.gesture.nodeId, this.gesture.control, world);
    } else {
      const hit = this.hit(world);
      this.hovered = hit && "nodeId" in hit ? hit.nodeId : null;
      this.hoveredPort = hit?.kind === "port"
        ? { nodeId: hit.nodeId, portId: hit.portId }
        : null;
      this.hoveredConnection = hit?.kind === "edge" ? hit.id : null;
      this.canvas.style.cursor =
        hit?.kind === "control" || hit?.kind === "port" ||
          hit?.kind === "menu" || hit?.kind === "edge"
          ? "pointer"
          : hit?.kind === "header" || this.space
          ? "grab"
          : "default";
    }
    this.pointer = world;
    if (this.pending) this.pending.point = world;
    this.invalidate();
  }
  private nodeDragDelta(
    gesture: Extract<Gesture, { kind: "move" }>,
    world: Point,
    altKey: boolean,
  ): Point {
    const delta = {
      x: world.x - gesture.start.x,
      y: world.y - gesture.start.y,
    };
    const first = Object.values(gesture.positions)[0];
    if (!first) return { x: 0, y: 0 };
    // Clicking or returning to the start must not snap an off-grid node.
    if (!delta.x && !delta.y) return delta;
    const grid = this.options.snapToGrid;
    if (grid && !altKey) {
      delta.x = Math.round((first.x + delta.x) / grid) * grid - first.x;
      delta.y = Math.round((first.y + delta.y) / grid) * grid - first.y;
    }
    return delta;
  }
  private pointerUp(event: PointerEvent) {
    if (!this.pointers.has(event.pointerId)) return;
    this.clearLongPress();
    const point = this.local(event),
      world = this.toWorld(point);
    this.pointers.delete(event.pointerId);
    if (this.pinch) {
      this.pinch = null;
      const remaining = [...this.pointers.values()][0];
      this.gesture = remaining
        ? { kind: "pan", start: remaining, viewport: this.getViewport() }
        : null;
    } else {
      const gesture = this.gesture;
      this.gesture = null;
      if (gesture?.kind === "move") {
        // A quick release can precede the final pointermove (or every move).
        // Commit from pointerup coordinates, independently of the painted preview.
        const delta = this.nodeDragDelta(gesture, world, event.altKey);
        this.previews.clear();
        if (delta.x || delta.y) {
          const positions = Object.fromEntries(
            Object.entries(gesture.positions).map(([id, origin]) => [
              id,
              { x: origin.x + delta.x, y: origin.y + delta.y },
            ]),
          );
          this.document.dispatch({
            type: "move-nodes",
            graphId: this.graphId,
            positions,
          });
        }
      } else if (gesture?.kind === "marquee" && this.marquee) {
        const ids = [...this.scene.nodes.values()]
          .filter((layout) => intersects(layout.bounds, this.marquee!))
          .map((layout) => layout.node.id);
        this.setSelection({
          nodes: gesture.additive ? [...this.selection.nodes, ...ids] : ids,
        });
      } else if (gesture?.kind === "slider") {
        const value = this.values.get(
          `${gesture.nodeId}:${gesture.control.definition.id}`,
        );
        this.values.clear();
        if (value !== undefined) {
          this.commitControl(gesture.nodeId, gesture.control, value);
        }
      }
      if (this.pending) {
        const hit = this.hit(world);
        if (
          hit?.kind === "port" &&
          (hit.nodeId !== this.pending.nodeId ||
            hit.portId !== this.pending.portId)
        ) {
          this.finishConnection(hit.nodeId, hit.portId);
        }
      }
    }
    this.marquee = null;
    this.canvas.style.cursor = "default";
    if (this.canvas.hasPointerCapture?.(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.invalidate();
  }
  private clearLongPress() {
    if (this.longPress !== null) clearTimeout(this.longPress);
    this.longPress = null;
  }
  private cancelGesture() {
    this.clearLongPress();
    this.gesture = null;
    this.pinch = null;
    this.marquee = null;
    this.previews.clear();
    this.values.clear();
    this.pointers.clear();
    this.invalidate();
  }
  private startOrFinishConnection(
    nodeId: string,
    portId: string,
    point: Point,
  ) {
    if (this.pending) {
      if (this.pending.nodeId === nodeId && this.pending.portId === portId) {
        this.pending = null;
      } else this.finishConnection(nodeId, portId);
    } else {
      const port = this.scene.nodes
        .get(nodeId)!
        .ports.find((port) => port.definition.id === portId)!;
      const edge = port.definition.direction === "input"
        ? Object.values(this.graph.connections).find(
          (edge) =>
            edge.target.nodeId === nodeId && edge.target.portId === portId,
        )
        : undefined;
      this.pending = edge
        ? { ...edge.source, point, reconnect: edge.id }
        : { nodeId, portId, point };
    }
    this.invalidate();
  }
  private finishConnection(nodeId: string, portId: string) {
    const pending = this.pending;
    if (!pending) return;
    let source: Endpoint = { nodeId: pending.nodeId, portId: pending.portId },
      target = { nodeId, portId };
    const first = this.scene.nodes
      .get(source.nodeId)!
      .ports.find((port) => port.definition.id === source.portId)!;
    if (first.definition.direction === "input") {
      [source, target] = [target, source];
    }
    this.document.transaction("Connect ports", () => {
      if (pending.reconnect) {
        this.document.dispatch({
          type: "disconnect",
          graphId: this.graphId,
          connectionId: pending.reconnect,
        });
      }
      this.document.connect(source, target, this.graphId);
    });
    this.pending = null;
    this.invalidate();
  }
  private commitControl(
    nodeId: string,
    control: ControlLayout,
    value: JsonValue,
  ): string | undefined {
    const d = control.definition;
    const error = d.validate?.(value);
    if (error) {
      this.reportError(error);
      return error;
    }
    try {
      this.document.dispatch({
        type: "update-node",
        graphId: this.graphId,
        nodeId,
        changes: { data: { [d.key ?? d.id]: value } },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.reportError(message);
      return message;
    }
  }
  private activateControl(
    nodeId: string,
    control: ControlLayout,
    point?: Point,
  ) {
    const d = control.definition;
    if (d.disabled) return;
    this.focusedControl = `${nodeId}:${d.id}`;
    const value = this.graph.nodes[nodeId].data[d.key ?? d.id] as JsonValue;
    if (d.kind === "toggle") this.commitControl(nodeId, control, !value);
    else if (d.kind === "button") {
      if (d.id === "open" && this.graph.nodes[nodeId].subgraphId) {
        this.openGraph(this.graph.nodes[nodeId].subgraphId!);
      } else {
        d.action?.({ document: this.document, graphId: this.graphId, nodeId });
      }
    } else if (d.kind === "select") {
      const screen = this.toScreen({
        x: control.bounds.x,
        y: control.bounds.y + control.bounds.height,
      });
      this.showMenu(
        screen,
        (d.options ?? []).map((option) => ({
          label: option.label,
          action: () => {
            this.commitControl(nodeId, control, option.value);
          },
        })),
        Math.max(180, control.bounds.width * this.viewport.scale),
      );
    } else if (d.kind === "slider") {
      if (point) {
        this.gesture = { kind: "slider", nodeId, control };
        this.previewSlider(nodeId, control, point);
      } else {
        this.commitControl(
          nodeId,
          control,
          Math.min(d.max ?? 100, Number(value ?? d.min ?? 0) + (d.step ?? 1)),
        );
      }
    } else if (this.custom.has(d.kind)) {
      const custom = this.custom.get(d.kind)!,
        next = point
          ? custom.pointer?.(point, control.bounds, value)
          : custom.key?.("Enter", value);
      if (next !== undefined) this.commitControl(nodeId, control, next);
    } else {
      this.bridge.open(
        {
          nodeId,
          controlId: d.id,
          value: String(value ?? ""),
          start: 0,
          end: String(value ?? "").length,
        },
        this.screenRect(control.bounds),
        {
          multiline: d.kind === "textarea",
          numeric: d.kind === "number",
          font: this.scene.nodes.get(nodeId)!.appearance.theme.font,
          fontSize: this.scene.nodes.get(nodeId)!.appearance.style.fontSize,
          lineHeight: this.scene.nodes.get(nodeId)!.appearance.style.lineHeight,
          padding: this.scene.nodes.get(nodeId)!.appearance.style.inputPadding,
          paddingY:
            this.scene.nodes.get(nodeId)!.appearance.style.inputPaddingY,
          scale: this.viewport.scale,
          label: `${this.graph.nodes[nodeId].label}: ${d.label}`,
          commit: (text) => {
            let value: JsonValue = text;
            if (d.kind === "number") {
              if (!text.trim() || !Number.isFinite(Number(text))) {
                this.reportError("Enter a finite number");
                return "Enter a finite number";
              }
              value = Number(text);
              if (
                (d.min !== undefined && value < d.min) ||
                (d.max !== undefined && value > d.max)
              ) {
                const message = `Enter a value between ${d.min ?? "−∞"} and ${
                  d.max ?? "∞"
                }`;
                this.reportError(message);
                return message;
              }
            }
            return this.commitControl(nodeId, control, value);
          },
          cancel: () => {},
          done: () => {
            if (!this.destroyed) this.canvas.focus({ preventScroll: true });
          },
        },
      );
      this.keepEditingVisible();
    }
    this.invalidate();
  }
  private previewSlider(nodeId: string, control: ControlLayout, point: Point) {
    const d = control.definition,
      ratio = Math.max(
        0,
        Math.min(
          1,
          (point.x - control.bounds.x) / Math.max(1, control.bounds.width - 36),
        ),
      ),
      step = d.step ?? 1;
    const raw = (d.min ?? 0) + ratio * ((d.max ?? 100) - (d.min ?? 0));
    this.values.set(
      `${nodeId}:${d.id}`,
      Math.max(
        d.min ?? 0,
        Math.min(d.max ?? 100, Math.round(raw / step) * step),
      ),
    );
    this.invalidate();
  }
  private screenRect(rect: Rect): Rect {
    return {
      ...this.toScreen(rect),
      width: rect.width * this.viewport.scale,
      height: rect.height * this.viewport.scale,
    };
  }
  private positionInput() {
    if (this.editing) {
      const control = this.scene.nodes
        .get(this.editing.nodeId)
        ?.controls.find(
          (control) => control.definition.id === this.editing!.controlId,
        );
      if (control) {
        this.bridge.reposition(
          this.screenRect(control.bounds),
          this.viewport.scale,
        );
      }
    }
  }
  private keepEditingVisible() {
    if (!this.editing) return;
    const control = this.scene.nodes
      .get(this.editing.nodeId)
      ?.controls.find(
        (control) => control.definition.id === this.editing!.controlId,
      );
    if (!control) return;
    const rect = this.screenRect(control.bounds),
      host = this.container.getBoundingClientRect(),
      view = globalThis.visualViewport;
    const bottom = Math.min(
      this.height,
      (view ? view.offsetTop + view.height : globalThis.innerHeight) - host.top,
    ) - 20;
    if (rect.y + rect.height > bottom) {
      this.setViewport({
        y: this.viewport.y - (rect.y + rect.height - bottom),
      });
    } else if (rect.y < 16) {
      this.setViewport({ y: this.viewport.y + 16 - rect.y });
    }
    this.positionInput();
  }
  private contextMenu(point: Point) {
    const hit = this.hit(this.toWorld(point));
    if (hit && "nodeId" in hit && !this.selection.nodes.includes(hit.nodeId)) {
      this.setSelection({ nodes: [hit.nodeId] });
    }
    if (hit?.kind === "edge") this.setSelection({ connections: [hit.id] });
    const items: CanvasMenu["items"] = [];
    if (this.selectedNodes().length) {
      items.push(
        { label: "Duplicate", action: () => this.duplicateSelection() },
        { label: "Group nodes", action: () => this.groupSelection() },
        { label: "Create subgraph", action: () => this.createSubgraph() },
        { label: "Delete", action: () => this.deleteSelection() },
      );
      const node = this.graph.nodes[this.selection.nodes[0]];
      if (node?.subgraphId) {
        items.unshift({
          label: "Open graph",
          action: () => this.openGraph(node.subgraphId!),
        });
      }
    } else if (this.selection.connections.length) {
      const edge = this.graph.connections[this.selection.connections[0]];
      items.push(
        {
          label: "Reconnect source",
          action: () => {
            this.pending = {
              ...edge.target,
              point: this.toWorld(point),
              reconnect: edge.id,
            };
            this.invalidate();
          },
        },
        {
          label: "Reconnect target",
          action: () => {
            this.pending = {
              ...edge.source,
              point: this.toWorld(point),
              reconnect: edge.id,
            };
            this.invalidate();
          },
        },
        { label: "Delete connection", action: () => this.deleteSelection() },
      );
    } else {
      for (const definition of this.document.registry.list()) {
        items.push({
          label: `Add ${definition.title}`,
          action: () => {
            const id = this.document.addNode(
              { type: definition.type, position: this.toWorld(point) },
              this.graphId,
            );
            this.setSelection({ nodes: [id] });
          },
        });
      }
    }
    for (const id of this.selection.groups) {
      items.push({
        label: "Ungroup",
        action: () =>
          this.document.dispatch({
            type: "ungroup",
            graphId: this.graphId,
            groupId: id,
          }),
      });
    }
    for (const command of this.commands.values()) {
      items.push({ label: command.label, action: () => command.run(this) });
    }
    this.showMenu(point, items, 210);
  }
  private showMenu(point: Point, items: CanvasMenu["items"], width = 200) {
    if (!items.length) return;
    const row = this.touch
        ? this.options.preset.menu.touchRowHeight
        : this.options.preset.menu.rowHeight,
      visibleCount = Math.min(
        items.length,
        Math.max(1, Math.floor((this.height - 16) / row)),
      );
    this.menu = {
      x: Math.max(4, Math.min(point.x, this.width - width - 4)),
      y: Math.max(4, Math.min(point.y, this.height - visibleCount * row - 12)),
      width: Math.min(width, this.width - 8),
      rowHeight: row,
      active: 0,
      offset: 0,
      visibleCount,
      items,
    };
    this.menuSemantics.replaceChildren();
    this.menuSemantics.setAttribute("role", "menu");
    items.forEach((item, i) => {
      const button = document.createElement("button");
      button.textContent = item.label;
      button.setAttribute("role", "menuitem");
      button.disabled = !!item.disabled;
      button.addEventListener("focus", () => {
        if (this.menu) {
          this.menu.active = i;
          this.revealMenuItem();
          this.invalidate();
        }
      });
      button.addEventListener("click", () => {
        this.closeMenu();
        this.attempt(item.action);
      });
      this.menuSemantics.append(button);
    });
    this.invalidate();
  }
  private menuPointer(point: Point, activate: boolean): boolean {
    const menu = this.menu;
    if (!menu) return false;
    const row = menu.rowHeight;
    if (
      !contains(
        {
          x: menu.x,
          y: menu.y,
          width: menu.width,
          height: menu.visibleCount * row + 8,
        },
        point,
      )
    ) {
      return false;
    }
    const i = menu.offset +
      Math.max(
        0,
        Math.min(
          menu.visibleCount - 1,
          Math.floor((point.y - menu.y - 4) / row),
        ),
      );
    menu.active = i;
    if (activate) {
      const item = menu.items[i];
      this.closeMenu();
      if (item && !item.disabled) this.attempt(item.action);
    }
    this.invalidate();
    return true;
  }
  private revealMenuItem() {
    const menu = this.menu;
    if (!menu) return;
    if (menu.active < menu.offset) menu.offset = menu.active;
    else if (menu.active >= menu.offset + menu.visibleCount) {
      menu.offset = menu.active - menu.visibleCount + 1;
    }
  }
  private closeMenu() {
    this.menu = null;
    this.menuSemantics.replaceChildren();
    this.menuSemantics.removeAttribute("role");
    this.invalidate();
  }
  private keyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (
      this.editing ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
      target.isContentEditable
    ) {
      return;
    }
    const modifier = event.metaKey || event.ctrlKey,
      key = event.key.toLowerCase();
    if (this.menu) {
      if (["arrowup", "arrowdown", "enter", "escape"].includes(key)) {
        event.preventDefault();
      }
      if (key === "escape") this.closeMenu();
      else if (key === "arrowdown" || key === "arrowup") {
        this.menu.active = (this.menu.active +
          (key === "arrowdown" ? 1 : -1) +
          this.menu.items.length) %
          this.menu.items.length;
        this.revealMenuItem();
        this.invalidate();
      } else if (key === "enter") {
        const item = this.menu.items[this.menu.active];
        this.closeMenu();
        if (!item.disabled) item.action();
      }
      return;
    }
    if (key === "escape") {
      this.cancelGesture();
      this.pending = null;
      this.setSelection({});
      event.preventDefault();
    } else if (event.code === "Space" && target === this.canvas) {
      this.space = true;
      event.preventDefault();
    } else if (modifier && key === "z") {
      event.preventDefault();
      event.shiftKey ? this.document.redo() : this.document.undo();
    } else if (modifier && key === "y") {
      event.preventDefault();
      this.document.redo();
    } else if (modifier && key === "a") {
      event.preventDefault();
      this.setSelection({ nodes: Object.keys(this.graph.nodes) });
    } else if (modifier && key === "d") {
      event.preventDefault();
      this.duplicateSelection();
    } else if (modifier && key === "g") {
      event.preventDefault();
      if (event.shiftKey) {
        for (const id of this.selection.groups) {
          this.document.dispatch({
            type: "ungroup",
            groupId: id,
            graphId: this.graphId,
          });
        }
      } else this.groupSelection();
    } else if (key === "delete" || key === "backspace") {
      event.preventDefault();
      this.deleteSelection();
    } else if (key === "f" && !modifier) {
      event.preventDefault();
      this.fitView();
    } else if (
      ["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key) &&
      target === this.canvas
    ) {
      event.preventDefault();
      const step = event.shiftKey ? 50 : 10,
        dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0,
        dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
      const positions = Object.fromEntries(
        this.selectedNodes().map((id) => [
          id,
          {
            x: this.graph.nodes[id].position.x + dx,
            y: this.graph.nodes[id].position.y + dy,
          },
        ]),
      );
      this.document.dispatch({
        type: "move-nodes",
        graphId: this.graphId,
        positions,
      });
    }
  }
  private copyEvent(event: ClipboardEvent, cut: boolean) {
    if (
      this.editing ||
      (event.target as HTMLElement).isContentEditable ||
      ["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)
    ) {
      return;
    }
    const ids = this.selectedNodes();
    if (!ids.length) return;
    this.clipboard = this.document.copy(ids, this.graphId);
    event.clipboardData?.setData("text/plain", JSON.stringify(this.clipboard));
    event.preventDefault();
    if (cut) this.deleteSelection();
  }
  private pasteEvent(event: ClipboardEvent) {
    if (
      this.editing ||
      (event.target as HTMLElement).isContentEditable ||
      ["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)
    ) {
      return;
    }
    const text = event.clipboardData?.getData("text/plain");
    if (!text && !this.clipboard) return;
    this.attempt(() => {
      const fragment = text ? JSON.parse(text) : this.clipboard;
      if (fragment?.format !== "nodeflow/fragment") return;
      event.preventDefault();
      this.setSelection({ nodes: this.document.paste(fragment, this.graphId) });
    });
  }
  private updateSemantics() {
    if (!this.scene) return;
    const active = this.semantics.contains(document.activeElement),
      activeLabel = document.activeElement?.getAttribute("aria-label");
    this.focusedPort = null;
    this.semantics.replaceChildren();
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Nodes in graph");
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Choose a node";
    select.append(empty);
    for (const node of Object.values(this.graph.nodes)) {
      const option = document.createElement("option");
      option.value = node.id;
      option.textContent = node.label;
      select.append(option);
    }
    select.value = this.selection.nodes[0] ?? "";
    select.addEventListener("change", () => {
      if (select.value) this.focusNode(select.value);
    });
    this.semantics.append(select);
    const id = this.selection.nodes[0],
      layout = this.scene.nodes.get(id);
    if (layout) {
      for (const control of layout.controls) {
        const d = control.definition,
          value = layout.node.data[d.key ?? d.id];
        const button = document.createElement("button");
        button.setAttribute("aria-label", `${layout.node.label}: ${d.label}`);
        button.textContent = `${d.label}: ${
          this.custom.get(d.kind)?.accessibleValue?.(value as JsonValue) ??
            String(value ?? "")
        }`;
        button.disabled = !!d.disabled;
        if (d.kind === "toggle") {
          button.setAttribute("aria-pressed", String(!!value));
        }
        if (d.kind === "select") button.setAttribute("aria-haspopup", "menu");
        button.addEventListener("focus", () => {
          this.focusedControl = `${id}:${d.id}`;
          const rect = this.screenRect(control.bounds);
          if (rect.y < 16) {
            this.setViewport({ y: this.viewport.y + 16 - rect.y });
          } else if (rect.y + rect.height > this.height - 16) {
            this.setViewport({
              y: this.viewport.y - (rect.y + rect.height - this.height + 16),
            });
          }
          this.invalidate();
        });
        button.addEventListener("click", () =>
          this.attempt(() => {
            if (this.viewport.scale < 0.8) this.focusNode(id);
            this.activateControl(
              id,
              this.scene.nodes
                .get(id)!
                .controls.find((item) => item.definition.id === d.id)!,
            );
          }));
        button.addEventListener("keydown", (event) => {
          if (
            (d.kind === "slider" || this.custom.has(d.kind)) &&
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              event.key,
            )
          ) {
            event.preventDefault();
            event.stopPropagation();
            const current = this.graph.nodes[id].data[
              d.key ?? d.id
            ] as JsonValue;
            const next = d.kind === "slider"
              ? Math.max(
                d.min ?? 0,
                Math.min(
                  d.max ?? 100,
                  Number(current) +
                    (["ArrowLeft", "ArrowDown"].includes(event.key) ? -1 : 1) *
                      (d.step ?? 1),
                ),
              )
              : this.custom.get(d.kind)!.key?.(event.key, current);
            if (next !== undefined) this.commitControl(id, control, next);
          }
        });
        this.semantics.append(button);
      }
      for (const port of layout.ports) {
        const button = document.createElement("button");
        button.textContent = `Connect ${port.definition.direction} ${
          port.definition.label ?? port.definition.id
        }`;
        button.setAttribute(
          "aria-label",
          `${layout.node.label}: ${button.textContent}`,
        );
        button.addEventListener("focus", () => {
          this.focusedPort = { nodeId: id, portId: port.definition.id };
          this.invalidate();
        });
        button.addEventListener("blur", () => {
          this.focusedPort = null;
          this.invalidate();
        });
        button.addEventListener(
          "click",
          () =>
            this.attempt(() =>
              this.startOrFinishConnection(id, port.definition.id, port.point)
            ),
        );
        this.semantics.append(button);
      }
    }
    if (active && activeLabel && !this.editing) {
      [...this.semantics.querySelectorAll<HTMLElement>("[aria-label]")]
        .find((element) => element.getAttribute("aria-label") === activeLabel)
        ?.focus({ preventScroll: true });
    }
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.caretTimer !== null) clearInterval(this.caretTimer);
    this.caretTimer = null;
    this.clearLongPress();
    this.bridge.close();
    this.resizeObserver?.disconnect();
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.listeners.clear();
    this.renderer.destroy();
    this.canvas.remove();
    this.semantics.remove();
    this.menuSemantics.remove();
    this.previews.clear();
    this.values.clear();
    this.results.clear();
    if (this.container.style.position === "relative") {
      this.container.style.position = this.originalPosition;
    }
    this.container.style.touchAction = this.originalTouchAction;
  }
}
