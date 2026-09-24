import assert from "node:assert/strict";
import {
  layoutGraph,
  layoutGraphAsync,
  layoutWithWorker,
} from "../src/layout/index.ts";
import type {
  LayoutInput,
  LayoutResult,
  LayoutWorker,
} from "../src/layout/index.ts";

function noOverlap(input: LayoutInput, result: LayoutResult) {
  for (let i = 0; i < input.nodes.length; i++) {
    for (let j = i + 1; j < input.nodes.length; j++) {
      const a = input.nodes[i],
        b = input.nodes[j],
        x = result.positions[a.id],
        y = result.positions[b.id];
      assert.equal(
        x.x + a.width <= y.x ||
          y.x + b.width <= x.x ||
          x.y + a.height <= y.y ||
          y.y + b.height <= x.y,
        true,
      );
    }
  }
}
const input: LayoutInput = {
  nodes: [
    { id: "a", width: 220, height: 90 },
    { id: "b", width: 280, height: 240 },
    { id: "c", width: 150, height: 100 },
    { id: "d", width: 320, height: 80 },
  ],
  edges: [
    { id: "ab", source: "a", target: "b" },
    { id: "bc", source: "b", target: "c" },
  ],
};
Deno.test("places variable-size and disconnected nodes deterministically in both directions", () => {
  for (const direction of ["right", "down"] as const) {
    const result = layoutGraph(input, { direction });
    noOverlap(input, result);
    assert.deepEqual(
      layoutGraph(
        {
          ...input,
          nodes: [...input.nodes].reverse(),
          edges: [...input.edges].reverse(),
        },
        { direction },
      ),
      result,
    );
    assert.ok(
      (result.positions.c[direction === "right" ? "x" : "y"]) >
        (result.positions.a[direction === "right" ? "x" : "y"]),
    );
  }
});
Deno.test("handles cycles and self-loops without changing topology or overlapping nodes", () => {
  const cyclic = {
      ...input,
      edges: [
        ...input.edges,
        { id: "ca", source: "c", target: "a" },
        { id: "dd", source: "d", target: "d" },
      ],
    },
    before = JSON.stringify(cyclic);
  const result = layoutGraph(cyclic);
  noOverlap(cyclic, result);
  assert.equal(JSON.stringify(cyclic), before);
});
Deno.test("lays out nested groups with bounds enclosing their members", () => {
  const grouped = {
    ...input,
    groups: [
      { id: "inner", nodeIds: ["a", "b"], parentId: "outer" },
      { id: "outer", nodeIds: ["c"] },
    ],
  };
  const result = layoutGraph(grouped);
  noOverlap(grouped, result);
  const inner = result.groups.inner,
    outer = result.groups.outer;
  assert.ok((inner.x) >= (outer.x));
  assert.ok((inner.y + inner.height) <= (outer.y + outer.height));
  for (const id of ["a", "b"]) {
    const node = input.nodes.find((node) => node.id === id)!;
    assert.ok((result.positions[id].x + node.width) <= (inner.x + inner.width));
  }
});
Deno.test("rejects malformed geometry, missing endpoints, and cyclic groups", () => {
  assert.throws(() =>
    layoutGraph({ nodes: [{ id: "a", width: NaN, height: 20 }], edges: [] })
  );
  assert.throws(() =>
    layoutGraph({
      ...input,
      edges: [{ id: "bad", source: "a", target: "missing" }],
    })
  );
  assert.throws(() =>
    layoutGraph({
      ...input,
      groups: [{ id: "g", nodeIds: [], parentId: "g" }],
    })
  );
});
Deno.test("matches cooperative and synchronous results and supports cancellation", async () => {
  assert.deepEqual(await layoutGraphAsync(input), layoutGraph(input));
  const controller = new AbortController();
  controller.abort(new Error("Cancelled"));
  await assert.rejects(
    layoutGraphAsync(input, { signal: controller.signal }),
    new RegExp("Cancelled"),
  );
});
Deno.test("cleans up a worker on cancellation", async () => {
  const controller = new AbortController();
  let terminations = 0;
  const worker: LayoutWorker = {
    postMessage() {},
    addEventListener() {},
    removeEventListener() {},
    terminate() {
      terminations++;
    },
  };
  const result = layoutWithWorker(() => worker, input, {
    signal: controller.signal,
  });
  controller.abort(new Error("Cancelled"));
  await assert.rejects(result, new RegExp("Cancelled"));
  assert.equal(terminations, 1);
});
Deno.test("lays out 1,000 nodes and 2,000 connections with finite geometry", () => {
  const large: LayoutInput = {
    nodes: Array.from({ length: 1000 }, (_, i) => ({
      id: `n${i}`,
      width: 240,
      height: 180,
    })),
    edges: Array.from({ length: 2000 }, (_, i) => ({
      id: `e${i}`,
      source: `n${i % 900}`,
      target: `n${Math.min(999, (i % 900) + (i < 900 ? 1 : 25))}`,
    })),
  };
  const result = layoutGraph(large);
  assert.equal((Object.keys(result.positions)).length, 1000);
  assert.equal(
    Object.values(result.positions).every(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
    ),
    true,
  );
});
