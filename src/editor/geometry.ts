import type {
  ConnectionRecord,
  DeepReadonly,
  GraphDocument,
  GraphRecord,
  NodeRecord,
  Point,
  PortDefinition,
  Rect,
} from "../core/index.ts";
import type {
  ControlDefinition,
  CustomControl,
  EditorOptions,
  NodePresentation,
  Theme,
} from "./types.ts";
import { resolveAppearance } from "./appearance.ts";
import type { ResolvedAppearance } from "./appearance.ts";
import {
  resolveConnectionAppearance,
  resolvePortAppearance,
} from "./linkAppearance.ts";
import type {
  ResolvedConnectionAppearance,
  ResolvedPortAppearance,
} from "./linkAppearance.ts";
import { SpatialIndex, union } from "./spatial.ts";
export interface ControlLayout {
  definition: ControlDefinition;
  bounds: Rect;
  row: Rect;
}
export interface PortLayout {
  definition: PortDefinition;
  point: Point;
  connected?: boolean;
}
export interface NodeGeometry {
  bounds: Rect;
  header: Rect;
  controls: ControlLayout[];
  ports: PortLayout[];
  summaryY: number;
}
export interface NodeLayout extends NodeGeometry {
  portAppearances: Map<string, ResolvedPortAppearance>;
  node: DeepReadonly<NodeRecord>;
  presentation: NodePresentation;
  appearance: ResolvedAppearance;
}
export interface EdgeGeometry {
  id: string;
  source: Point;
  target: Point;
  c1: Point;
  c2: Point;
  samples: Point[];
  bounds: Rect;
  dataType: string;
}
export interface SceneGeometry {
  nodes: Map<string, NodeLayout>;
  edges: Map<string, EdgeGeometry>;
  connectionAppearances: Map<string, ResolvedConnectionAppearance>;
  pendingAppearance: ResolvedConnectionAppearance;
  groups: Map<string, Rect>;
  nodeIndex: SpatialIndex;
  edgeIndex: SpatialIndex;
}

export function edgeCurve(
  id: string,
  source: Point,
  target: Point,
  sourceSide = "right",
  targetSide = "left",
  dataType = "any",
): EdgeGeometry {
  const distance = Math.max(
    64,
    Math.abs(target.x - source.x) * 0.48,
    Math.abs(target.y - source.y) * 0.15,
  );
  const vector = (side: string): Point =>
    side === "left"
      ? { x: -1, y: 0 }
      : side === "top"
      ? { x: 0, y: -1 }
      : side === "bottom"
      ? { x: 0, y: 1 }
      : { x: 1, y: 0 };
  const a = vector(sourceSide),
    b = vector(targetSide);
  const c1 = { x: source.x + a.x * distance, y: source.y + a.y * distance },
    c2 = { x: target.x + b.x * distance, y: target.y + b.y * distance };
  const samples = Array.from({ length: 25 }, (_, i) => {
    const t = i / 24,
      u = 1 - t;
    return {
      x: u ** 3 * source.x +
        3 * u * u * t * c1.x +
        3 * u * t * t * c2.x +
        t ** 3 * target.x,
      y: u ** 3 * source.y +
        3 * u * u * t * c1.y +
        3 * u * t * t * c2.y +
        t ** 3 * target.y,
    };
  });
  const bounds = union(
    [source, target, c1, c2].map((point) => ({
      ...point,
      width: 0,
      height: 0,
    })),
  );
  return { id, source, target, c1, c2, samples, bounds, dataType };
}
export function buildGeometry(
  document: GraphDocument,
  graph: DeepReadonly<GraphRecord>,
  presentations: Map<string, NodePresentation>,
  custom: Map<string, CustomControl>,
  touch: boolean,
  theme: Theme,
  options: Pick<
    EditorOptions,
    | "preset"
    | "nodes"
    | "nodeAppearance"
    | "ports"
    | "portAppearance"
    | "connections"
    | "connectionAppearance"
  >,
): SceneGeometry {
  const pendingAppearance = resolveConnectionAppearance(
    options.preset.connections,
    options.connections,
  );
  const connectionAppearances = new Map<string, ResolvedConnectionAppearance>();
  const nodes = new Map<string, NodeLayout>(),
    edges = new Map<string, EdgeGeometry>(),
    groups = new Map<string, Rect>(),
    nodeIndex = new SpatialIndex(),
    edgeIndex = new SpatialIndex();
  for (
    const node of Object.values(graph.nodes).sort((a, b) =>
      a.id.localeCompare(b.id)
    )
  ) {
    const presentation = presentations.get(node.type) ?? {
      type: node.type,
    };
    const definitions = typeof presentation.controls === "function"
      ? presentation.controls(node)
      : (presentation.controls ?? []);
    const appearance = resolveAppearance(
      options.preset.nodes,
      theme,
      touch,
      options.nodes,
      presentation.appearance,
      options.nodeAppearance?.(node),
    );
    const s = appearance.style;
    const ports = document.registry.ports(node, graph, document.snapshot());
    const hasInputs = ports.some((port) => port.direction === "input");
    const portRow = presentation.portLayout === "row" ||
      node.type === "@subgraph";
    const width = node.width ?? presentation.width ??
        (definitions.length ? 252 : 224),
      headerHeight = s.headerHeight;
    const controls: ControlLayout[] = [];
    let y = node.position.y +
      headerHeight +
      (portRow
        ? node.type === "@subgraph" ? 80 : 54
        : presentation.summary
        ? 40
        : s.padding);
    for (const definition of definitions) {
      const height = definition.height ??
        custom.get(definition.kind)?.height ??
        (definition.kind === "toggle"
          ? touch ? 48 : 40
          : definition.kind === "button"
          ? s.controlHeight + s.controlGap + 4
          : definition.kind === "textarea"
          ? 102
          : definition.kind === "slider"
          ? 64
          : s.controlHeight + s.labelHeight + s.controlGap);
      const inset = hasInputs && !portRow ? s.inputColumnWidth : 0;
      const x = node.position.x + s.padding + inset,
        fieldWidth = Math.max(1, width - inset - s.padding * 2);
      controls.push({
        definition,
        row: { x, y, width: fieldWidth, height },
        bounds: {
          x,
          y: y +
            (["toggle", "button"].includes(definition.kind)
              ? 0
              : s.labelHeight),
          width: fieldWidth,
          height: Math.max(
            1,
            height - s.controlGap -
              (["toggle", "button"].includes(definition.kind)
                ? 2
                : s.labelHeight),
          ),
        },
      });
      y += height;
    }
    if (node.type === "@subgraph") {
      controls.push({
        definition: { id: "open", kind: "button", label: "Open graph" },
        row: {
          x: node.position.x + s.padding,
          y,
          width: width - s.padding * 2,
          height: 44,
        },
        bounds: {
          x: node.position.x + s.padding,
          y,
          width: width - s.padding * 2,
          height: 34,
        },
      });
      y += 44;
    }
    const sideCount = Math.max(
      0,
      ...["left", "right"].map(
        (side) =>
          ports.filter(
            (port) =>
              (port.side ?? (port.direction === "input" ? "left" : "right")) ===
                side,
          ).length,
      ),
    );
    const height = Math.max(
      portRow && presentation.summary ? 156 : 110,
      y - node.position.y + 8,
      headerHeight + 28 + sideCount * 30,
    ) + s.footerHeight;
    const bounds = { ...node.position, width, height },
      header = { ...node.position, width, height: headerHeight };
    const portLayouts = ports.map((port) => {
      const side = port.side ?? (port.direction === "input" ? "left" : "right");
      const peers = ports.filter(
          (item) =>
            (item.side ?? (item.direction === "input" ? "left" : "right")) ===
              side,
        ),
        i = peers.findIndex((item) => item.id === port.id);
      const ratio = (i + 1) / (peers.length + 1);
      return {
        definition: port,
        point: {
          x: side === "left"
            ? bounds.x
            : side === "right"
            ? bounds.x + width
            : bounds.x + width * ratio,
          y: side === "top"
            ? bounds.y
            : side === "bottom"
            ? bounds.y + height
            : portRow
            ? bounds.y +
              headerHeight +
              (node.type === "@subgraph" ? 56 : 32) +
              (i - (peers.length - 1) / 2) * 28
            : hasInputs && definitions.length
            ? bounds.y +
              headerHeight +
              Math.min(80, (height - headerHeight) / 2) +
              (i - (peers.length - 1) / 2) * 30
            : bounds.y + headerHeight + (height - headerHeight) * ratio,
        },
      };
    });
    let geometry: NodeGeometry = {
      bounds,
      header,
      controls,
      ports: portLayouts,
      summaryY: node.position.y + headerHeight + (portRow ? 88 : 22),
    };
    geometry = appearance.layout?.(geometry, node) ?? geometry;
    for (
      const rect of [
        geometry.bounds,
        geometry.header,
        ...geometry.controls.flatMap((c) => [c.bounds, c.row]),
      ]
    ) {
      if (
        ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
        rect.width < 0 || rect.height < 0
      ) {
        throw new Error(`Invalid layout for node ${node.id}`);
      }
    }
    if (
      !Number.isFinite(geometry.summaryY) ||
      geometry.ports.some((port) =>
        !Number.isFinite(port.point.x) || !Number.isFinite(port.point.y)
      )
    ) {
      throw new Error(`Invalid layout for node ${node.id}`);
    }
    const portAppearances = new Map(
      geometry.ports.map((port) => [
        port.definition.id,
        resolvePortAppearance(
          options.preset.ports,
          touch,
          options.ports,
          ...appearance.ports,
          options.portAppearance?.(node, port.definition),
        ),
      ]),
    );
    nodes.set(node.id, {
      ...geometry,
      node,
      presentation,
      appearance,
      portAppearances,
    });
    const extent = Math.max(
      16,
      ...[...portAppearances.values()].map((p) =>
        Math.max(
          p.style.hitRadius,
          p.style.radius * Math.max(1, p.style.hoverScale) + p.style.width +
            p.style.haloWidth,
        )
      ),
    );
    nodeIndex.insert(node.id, {
      x: geometry.bounds.x - extent,
      y: geometry.bounds.y - extent,
      width: geometry.bounds.width + extent * 2,
      height: geometry.bounds.height + extent * 2,
    });
  }
  for (const connection of Object.values(graph.connections)) {
    const source = nodes
        .get(connection.source.nodeId)
        ?.ports.find((port) => port.definition.id === connection.source.portId),
      target = nodes
        .get(connection.target.nodeId)
        ?.ports.find((port) => port.definition.id === connection.target.portId);
    if (!source || !target) continue;
    source.connected = target.connected = true;
    const appearance = resolveConnectionAppearance(
      options.preset.connections,
      options.connections,
      options.connectionAppearance?.(connection),
    );
    const edge = routeConnection(
      edgeCurve(
        connection.id,
        source.point,
        target.point,
        source.definition.side ?? "right",
        target.definition.side ?? "left",
        source.definition.dataType,
      ),
      appearance,
      connection,
    );
    connectionAppearances.set(connection.id, appearance);
    edges.set(edge.id, edge);
    const extent = Math.max(
      12,
      appearance.style.hitWidth / 2,
      Math.max(
        appearance.style.width,
        appearance.style.hoverWidth,
        appearance.style.selectedWidth,
      ) + appearance.style.outlineWidth,
    );
    edgeIndex.insert(edge.id, {
      x: edge.bounds.x - extent,
      y: edge.bounds.y - extent,
      width: edge.bounds.width + extent * 2,
      height: edge.bounds.height + extent * 2,
    });
  }
  const groupBounds = (id: string): Rect => {
    const existing = groups.get(id);
    if (existing) return existing;
    const group = graph.groups[id],
      rects = group.nodeIds.map((id) => nodes.get(id)!.bounds);
    for (const child of Object.values(graph.groups)) {
      if (child.parentId === id) rects.push(groupBounds(child.id));
    }
    const bounds = union(rects),
      result = {
        x: bounds.x - 24,
        y: bounds.y - 44,
        width: Math.max(200, bounds.width + 48),
        height: Math.max(100, bounds.height + 68),
      };
    groups.set(id, result);
    return result;
  };
  Object.keys(graph.groups).forEach(groupBounds);
  return {
    nodes,
    edges,
    groups,
    nodeIndex,
    edgeIndex,
    connectionAppearances,
    pendingAppearance,
  };
}
/** Applied during geometry rebuilds and drag/connection previews, never to a stale route. */
export function routeConnection(
  edge: EdgeGeometry,
  appearance: ResolvedConnectionAppearance,
  connection: DeepReadonly<ConnectionRecord> | null,
): EdgeGeometry {
  const routed = appearance.geometry?.(edge, connection) ?? edge;
  const b = routed.bounds;
  if (
    routed.id !== edge.id || routed.samples.length < 2 ||
    ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width < 0 ||
    b.height < 0 ||
    [routed.source, routed.target, routed.c1, routed.c2, ...routed.samples]
      .some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  ) {
    throw new Error("Invalid connection geometry");
  }
  return routed;
}
export function distanceToCurve(point: Point, edge: EdgeGeometry): number {
  let closest = Infinity;
  for (let i = 1; i < edge.samples.length; i++) {
    const a = edge.samples[i - 1],
      b = edge.samples[i],
      dx = b.x - a.x,
      dy = b.y - a.y,
      length = dx * dx + dy * dy;
    const t = length
      ? Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length),
      )
      : 0;
    closest = Math.min(
      closest,
      Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy),
    );
  }
  return closest;
}
