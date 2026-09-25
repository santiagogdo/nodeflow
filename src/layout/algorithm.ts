import type { Point, Rect } from "../core/types.ts";
import type {
  LayoutEdge,
  LayoutInput,
  LayoutNode,
  LayoutOptions,
  LayoutResult,
} from "./types.ts";

interface Scope {
  id?: string;
  parent?: Scope;
  depth: number;
  ancestors: Scope[];
  nodes: LayoutNode[];
  children: Scope[];
  edges: LayoutEdge[];
  placement: Map<string, Point>;
  width: number;
  height: number;
}
const boundsOf = (rects: Rect[]): Rect => {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...rects.map((rect) => rect.x)),
    y = Math.min(...rects.map((rect) => rect.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x,
    height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y,
  };
};

/** Original layered layout: SCC condensation, rank assignment, crossing sweeps, and packing. */
function* layered(
  boxes: LayoutNode[],
  edges: LayoutEdge[],
  rankGap: number,
  nodeGap: number,
): Generator<void, Map<string, Point>> {
  const byId = new Map(boxes.map((box) => [box.id, box]));
  const next = new Map(boxes.map((box) => [box.id, [] as string[]]));
  for (const edge of edges) {
    if (
      edge.source !== edge.target &&
      byId.has(edge.source) &&
      byId.has(edge.target)
    ) {
      next.get(edge.source)!.push(edge.target);
    }
  }
  next.forEach((list) => list.sort());
  const index = new Map<string, number>(),
    low = new Map<string, number>(),
    stack: string[] = [],
    onStack = new Set<string>(),
    components: string[][] = [];
  let sequence = 0;
  function* visit(id: string): Generator<void> {
    index.set(id, sequence);
    low.set(id, sequence++);
    stack.push(id);
    onStack.add(id);
    yield;
    for (const target of next.get(id)!) {
      if (!index.has(target)) {
        yield* visit(target);
        low.set(id, Math.min(low.get(id)!, low.get(target)!));
      } else if (onStack.has(target)) {
        low.set(id, Math.min(low.get(id)!, index.get(target)!));
      }
    }
    if (low.get(id) === index.get(id)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== id);
      components.push(component.sort());
    }
  }
  for (const id of [...byId.keys()].sort()) {
    if (!index.has(id)) yield* visit(id);
  }
  const owner = new Map<string, number>();
  components.forEach((members, i) => members.forEach((id) => owner.set(id, i)));
  const inner = components.map((members) => {
    const positions = new Map<string, Point>();
    if (members.length === 1) {
      positions.set(members[0], { x: 0, y: 0 });
      return {
        positions,
        width: byId.get(members[0])!.width,
        height: byId.get(members[0])!.height,
      };
    }
    const diameter = Math.max(
      ...members.map((id) =>
        Math.hypot(byId.get(id)!.width, byId.get(id)!.height)
      ),
    ) + nodeGap;
    const radius = diameter / (2 * Math.sin(Math.PI / members.length));
    const rects = members.map((id, i) => {
      const box = byId.get(id)!;
      const angle = (i * Math.PI * 2) / members.length;
      return {
        x: radius * Math.cos(angle) - box.width / 2,
        y: radius * Math.sin(angle) - box.height / 2,
        width: box.width,
        height: box.height,
      };
    });
    const bounds = boundsOf(rects);
    members.forEach((id, i) =>
      positions.set(id, { x: rects[i].x - bounds.x, y: rects[i].y - bounds.y })
    );
    return { positions, width: bounds.width, height: bounds.height };
  });
  const forward = components.map(() => new Set<number>()),
    backward = components.map(() => new Set<number>());
  for (const edge of edges) {
    const source = owner.get(edge.source),
      target = owner.get(edge.target);
    if (source !== undefined && target !== undefined && source !== target) {
      forward[source].add(target);
      backward[target].add(source);
    }
  }
  const remaining = new Set(components.map((_, i) => i)),
    islands: number[][] = [];
  while (remaining.size) {
    const start = [...remaining].sort((a, b) =>
        components[a][0].localeCompare(components[b][0])
      )[0],
      island: number[] = [],
      queue = [start];
    remaining.delete(start);
    while (queue.length) {
      const at = queue.pop()!;
      island.push(at);
      for (const neighbor of [...forward[at], ...backward[at]]) {
        if (remaining.delete(neighbor)) {
          queue.push(neighbor);
        }
      }
      yield;
    }
    islands.push(island);
  }
  const placed = new Map<string, Point>();
  let islandY = 0;
  for (const island of islands) {
    const rank = new Map(island.map((i) => [i, 0])),
      degree = new Map(island.map((i) => [i, backward[i].size]));
    const ready = island
      .filter((i) => degree.get(i) === 0)
      .sort((a, b) => components[a][0].localeCompare(components[b][0]));
    while (ready.length) {
      const at = ready.shift()!;
      for (const target of forward[at]) {
        rank.set(target, Math.max(rank.get(target)!, rank.get(at)! + 1));
        degree.set(target, degree.get(target)! - 1);
        if (!degree.get(target)) ready.push(target);
      }
      yield;
    }
    const levels: number[][] = Array.from(
      { length: Math.max(0, ...rank.values()) + 1 },
      () => [],
    );
    for (const at of island) levels[rank.get(at)!].push(at);
    levels.forEach((level) =>
      level.sort((a, b) => components[a][0].localeCompare(components[b][0]))
    );
    for (let sweep = 0; sweep < 6; sweep++) {
      const order = new Map<number, number>();
      levels.forEach((level) => level.forEach((at, i) => order.set(at, i)));
      const levelOrder = sweep % 2 ? [...levels].reverse() : levels;
      for (const level of levelOrder) {
        const barycenter = (at: number) => {
          const neighbors = [...(sweep % 2 ? forward[at] : backward[at])];
          return neighbors.length
            ? neighbors.reduce((sum, id) => sum + order.get(id)!, 0) /
              neighbors.length
            : order.get(at)!;
        };
        level.sort(
          (a, b) =>
            barycenter(a) - barycenter(b) ||
            components[a][0].localeCompare(components[b][0]),
        );
        level.forEach((at, i) => order.set(at, i));
        yield;
      }
    }
    const heights = levels.map(
      (level) =>
        level.reduce((sum, at) => sum + inner[at].height, 0) +
        Math.max(0, level.length - 1) * nodeGap,
    );
    const height = Math.max(0, ...heights);
    let x = 0;
    for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
      const level = levels[levelIndex],
        width = Math.max(0, ...level.map((at) => inner[at].width));
      let y = islandY + (height - heights[levelIndex]) / 2;
      for (const at of level) {
        for (const [id, point] of inner[at].positions) {
          placed.set(id, { x: x + point.x, y: y + point.y });
        }
        y += inner[at].height + nodeGap;
        yield;
      }
      x += width + rankGap;
    }
    islandY += height + rankGap;
  }
  return placed;
}

export function* layoutSteps(
  input: LayoutInput,
  options: LayoutOptions = {},
): Generator<void, LayoutResult> {
  const down = options.direction === "down",
    rankGap = options.rankSpacing ?? 100,
    nodeGap = options.nodeSpacing ?? 48;
  if (
    ![rankGap, nodeGap].every((value) => Number.isFinite(value) && value >= 0)
  ) {
    throw new Error("Layout spacing must be finite and nonnegative");
  }
  const origin = options.origin ?? { x: 40, y: 40 };
  if (![origin.x, origin.y].every(Number.isFinite)) {
    throw new Error("Layout origin must be finite");
  }
  const nodes = new Map<string, LayoutNode>();
  for (const supplied of input.nodes) {
    const node = {
      id: supplied.id,
      width: supplied.width,
      height: supplied.height,
    };
    if (nodes.has(node.id)) throw new Error("Duplicate layout node IDs");
    if (
      !node.id ||
      ![node.width, node.height].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    ) {
      throw new Error("Layout nodes require positive finite sizes");
    }
    nodes.set(node.id, node);
    yield;
  }
  const edges: LayoutEdge[] = [];
  for (const supplied of input.edges) {
    const edge = {
      id: supplied.id,
      source: supplied.source,
      target: supplied.target,
    };
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) {
      throw new Error("Layout edge refers to a missing node");
    }
    edges.push(edge);
    yield;
  }
  const createScope = (id?: string): Scope => ({
    id,
    depth: 0,
    ancestors: [],
    nodes: [],
    children: [],
    edges: [],
    placement: new Map(),
    width: 0,
    height: 0,
  });
  const root = createScope(),
    groups = new Map<string, Scope>(),
    parents = new Map<string, string | undefined>();
  const membership = new Map<string, string>();
  for (const supplied of input.groups ?? []) {
    const group = {
      id: supplied.id,
      parentId: supplied.parentId,
      nodeIds: [...supplied.nodeIds],
    };
    if (groups.has(group.id)) throw new Error("Duplicate layout group IDs");
    if (nodes.has(group.id)) {
      throw new Error("Layout node and group IDs must differ");
    }
    groups.set(group.id, createScope(group.id));
    parents.set(group.id, group.parentId);
    for (const id of group.nodeIds) {
      if (!nodes.has(id) || membership.has(id)) {
        throw new Error("Invalid layout group membership");
      }
      membership.set(id, group.id);
      yield;
    }
    yield;
  }
  for (const [id, scope] of groups) {
    const parentId = parents.get(id);
    const parent = parentId === undefined ? root : groups.get(parentId);
    if (!parent) throw new Error("Invalid layout group hierarchy");
    scope.parent = parent;
    parent.children.push(scope);
    yield;
  }
  // Every group has one parent. A group unreachable from the root is in, or
  // below, a cycle. Index each reachable scope once, without ancestor walks.
  const order: Scope[] = [], pending = [root];
  while (pending.length) {
    const scope = pending.pop()!;
    order.push(scope);
    if (scope.parent) {
      scope.depth = scope.parent.depth + 1;
      scope.ancestors.push(scope.parent);
      for (let i = 1; scope.ancestors[i - 1].ancestors[i - 1]; i++) {
        scope.ancestors.push(scope.ancestors[i - 1].ancestors[i - 1]);
      }
    }
    for (let i = scope.children.length - 1; i >= 0; i--) {
      pending.push(scope.children[i]);
    }
    yield;
  }
  if (order.length !== groups.size + 1) {
    throw new Error("Invalid layout group hierarchy");
  }
  const containers = new Map<string, Scope>();
  for (const node of nodes.values()) {
    const groupId = membership.get(node.id);
    const scope = groupId === undefined ? root : groups.get(groupId)!;
    scope.nodes.push({
      id: node.id,
      width: down ? node.height : node.width,
      height: down ? node.width : node.height,
    });
    containers.set(node.id, scope);
    yield;
  }
  const lift = (scope: Scope, depth: number) => {
    let distance = scope.depth - depth;
    for (let i = 0; distance; i++, distance = Math.floor(distance / 2)) {
      if (distance % 2) scope = scope.ancestors[i];
    }
    return scope;
  };
  for (const edge of edges) {
    const source = containers.get(edge.source)!,
      target = containers.get(edge.target)!;
    let left = lift(source, Math.min(source.depth, target.depth)),
      right = lift(target, Math.min(source.depth, target.depth));
    if (left !== right) {
      for (let i = left.ancestors.length - 1; i >= 0; i--) {
        if (left.ancestors[i] !== right.ancestors[i]) {
          left = left.ancestors[i];
          right = right.ancestors[i];
        }
      }
      left = left.parent!;
    }
    // Only the lowest common scope needs this edge; higher scopes see a
    // self-loop inside one child, which layered() would ignore.
    left.edges.push({
      ...edge,
      source: source === left ? edge.source : lift(source, left.depth + 1).id!,
      target: target === left ? edge.target : lift(target, left.depth + 1).id!,
    });
    yield;
  }
  // Size scopes bottom-up, retaining only immediate child placements.
  for (let i = order.length - 1; i >= 0; i--) {
    const scope = order[i];
    const boxes = [
      ...scope.nodes,
      ...scope.children.map((child) => ({
        id: child.id!,
        width: child.width,
        height: child.height,
      })),
    ];
    const placement = yield* layered(boxes, scope.edges, rankGap, nodeGap);
    scope.placement = placement;
    const padding = scope === root ? 0 : 32,
      header = scope === root ? 0 : 48;
    const localBounds = boundsOf(
      boxes.map((box) => ({
        ...placement.get(box.id)!,
        width: box.width,
        height: box.height,
      })),
    );
    scope.width = Math.max(
      scope === root ? 0 : 240,
      localBounds.width + padding * 2,
    );
    scope.height = Math.max(
      scope === root ? 0 : 120,
      localBounds.height + padding + header,
    );
    yield;
  }
  const positions: Record<string, Point> = Object.create(null),
    groupBounds: Record<string, Rect> = Object.create(null),
    offsets = new Map<Scope, Point>([[root, { x: 0, y: 0 }]]);
  const point = (x: number, y: number): Point => ({
    x: origin.x + (down ? y : x),
    y: origin.y + (down ? x : y),
  });
  // Flatten once, rather than copying every descendant at every ancestor.
  for (const scope of order) {
    const offset = offsets.get(scope)!,
      padding = scope === root ? 0 : 32,
      header = scope === root ? 0 : 48;
    if (scope !== root) {
      groupBounds[scope.id!] = {
        ...point(offset.x, offset.y),
        width: down ? scope.height : scope.width,
        height: down ? scope.width : scope.height,
      };
    }
    for (const node of scope.nodes) {
      const local = scope.placement.get(node.id)!;
      positions[node.id] = point(
        offset.x + local.x + padding,
        offset.y + local.y + header,
      );
      yield;
    }
    for (const child of scope.children) {
      const local = scope.placement.get(child.id!)!;
      offsets.set(child, {
        x: offset.x + local.x + padding,
        y: offset.y + local.y + header,
      });
      yield;
    }
    yield;
  }
  return {
    positions,
    groups: groupBounds,
    bounds: {
      ...origin,
      width: down ? root.height : root.width,
      height: down ? root.width : root.height,
    },
  };
}
export function layoutGraph(
  input: LayoutInput,
  options: LayoutOptions = {},
): LayoutResult {
  options.signal?.throwIfAborted();
  const steps = layoutSteps(input, options);
  let result = steps.next();
  while (!result.done) {
    options.signal?.throwIfAborted();
    result = steps.next();
  }
  options.signal?.throwIfAborted();
  return result.value;
}
export async function layoutGraphAsync(
  input: LayoutInput,
  options: LayoutOptions = {},
): Promise<LayoutResult> {
  options.signal?.throwIfAborted();
  const steps = layoutSteps(input, options);
  let result = steps.next(),
    started = performance.now();
  while (!result.done) {
    options.signal?.throwIfAborted();
    if (performance.now() - started >= 8) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      started = performance.now();
    }
    options.signal?.throwIfAborted();
    result = steps.next();
  }
  options.signal?.throwIfAborted();
  return result.value;
}
