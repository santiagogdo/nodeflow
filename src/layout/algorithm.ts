import type { Point, Rect } from "../core/types.ts";
import type {
  LayoutEdge,
  LayoutInput,
  LayoutNode,
  LayoutOptions,
  LayoutResult,
} from "./types.ts";

interface Box extends LayoutNode {
  positions: Record<string, Point>;
  groups: Record<string, Rect>;
  members: Set<string>;
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
  boxes: Box[],
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
  const nodes = new Map(input.nodes.map((node) => [node.id, node]));
  if (nodes.size !== input.nodes.length) {
    throw new Error("Duplicate layout node IDs");
  }
  for (const node of nodes.values()) {
    if (
      !node.id ||
      ![node.width, node.height].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    ) {
      throw new Error("Layout nodes require positive finite sizes");
    }
  }
  for (const edge of input.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) {
      throw new Error("Layout edge refers to a missing node");
    }
  }
  const groups = new Map(
    (input.groups ?? []).map((group) => [group.id, group]),
  );
  if (groups.size !== (input.groups?.length ?? 0)) {
    throw new Error("Duplicate layout group IDs");
  }
  const membership = new Map<string, string>();
  for (const group of groups.values()) {
    if (nodes.has(group.id)) {
      throw new Error("Layout node and group IDs must differ");
    }
    for (const id of group.nodeIds) {
      if (!nodes.has(id) || membership.has(id)) {
        throw new Error("Invalid layout group membership");
      }
      membership.set(id, group.id);
    }
    let parent = group.parentId;
    const ancestors = new Set([group.id]);
    while (parent) {
      if (ancestors.has(parent) || !groups.has(parent)) {
        throw new Error("Invalid layout group hierarchy");
      }
      ancestors.add(parent);
      parent = groups.get(parent)!.parentId;
    }
  }
  function* scope(parent?: string): Generator<void, Box> {
    const boxes: Box[] = [];
    for (const node of nodes.values()) {
      if (membership.get(node.id) === parent) {
        boxes.push({
          id: node.id,
          width: down ? node.height : node.width,
          height: down ? node.width : node.height,
          positions: { [node.id]: { x: 0, y: 0 } },
          groups: {},
          members: new Set([node.id]),
        });
      }
    }
    for (const group of groups.values()) {
      if (group.parentId === parent) boxes.push(yield* scope(group.id));
    }
    const owner = new Map<string, string>();
    boxes.forEach((box) => box.members.forEach((id) => owner.set(id, box.id)));
    const edges = input.edges
      .filter((edge) => owner.has(edge.source) && owner.has(edge.target))
      .map((edge) => ({
        ...edge,
        source: owner.get(edge.source)!,
        target: owner.get(edge.target)!,
      }));
    const placement = yield* layered(boxes, edges, rankGap, nodeGap);
    const positions: Record<string, Point> = Object.create(null),
      groupBounds: Record<string, Rect> = Object.create(null),
      members = new Set<string>();
    const padding = parent ? 32 : 0,
      header = parent ? 48 : 0;
    const localBounds = boundsOf(
      boxes.map((box) => ({
        ...placement.get(box.id)!,
        width: box.width,
        height: box.height,
      })),
    );
    const width = Math.max(parent ? 240 : 0, localBounds.width + padding * 2),
      height = Math.max(
        parent ? 120 : 0,
        localBounds.height + padding + header,
      );
    for (const box of boxes) {
      const offset = placement.get(box.id)!;
      for (const [id, point] of Object.entries(box.positions)) {
        positions[id] = {
          x: point.x + offset.x + padding,
          y: point.y + offset.y + header,
        };
        members.add(id);
      }
      for (const [id, rect] of Object.entries(box.groups)) {
        groupBounds[id] = {
          ...rect,
          x: rect.x + offset.x + padding,
          y: rect.y + offset.y + header,
        };
      }
    }
    if (parent) groupBounds[parent] = { x: 0, y: 0, width, height };
    return {
      id: parent ?? "",
      width,
      height,
      positions,
      groups: groupBounds,
      members,
    };
  }
  const result = yield* scope();
  for (const point of Object.values(result.positions)) {
    if (down) [point.x, point.y] = [point.y, point.x];
    point.x += origin.x;
    point.y += origin.y;
  }
  for (const rect of Object.values(result.groups)) {
    if (down) {
      [rect.x, rect.y] = [rect.y, rect.x];
      [rect.width, rect.height] = [rect.height, rect.width];
    }
    rect.x += origin.x;
    rect.y += origin.y;
  }
  return {
    positions: result.positions,
    groups: result.groups,
    bounds: {
      ...origin,
      width: down ? result.height : result.width,
      height: down ? result.width : result.height,
    },
  };
}
export function layoutGraph(
  input: LayoutInput,
  options: LayoutOptions = {},
): LayoutResult {
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
  const steps = layoutSteps(input, options);
  let result = steps.next(),
    started = performance.now();
  while (!result.done) {
    options.signal?.throwIfAborted();
    if (performance.now() - started >= 8) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      started = performance.now();
    }
    result = steps.next();
  }
  options.signal?.throwIfAborted();
  return result.value;
}
