import assert from "node:assert/strict";
import { SpatialIndex } from "../src/editor/spatial.ts";

Deno.test("indexes negative and very large bounds without omitting intersecting objects", () => {
  const index = new SpatialIndex();
  index.insert("negative", { x: -100, y: -100, width: 150, height: 150 });
  index.insert("long", { x: -100000, y: 0, width: 200000, height: 10 });
  assert.deepEqual(index.query({ x: -20, y: 0, width: 40, height: 5 }).sort(), [
    "long",
    "negative",
  ]);
  assert.deepEqual(index.query({ x: 0, y: 100, width: 40, height: 5 }), []);
});

Deno.test("spatial index terminates for extreme finite coordinates and overflowing extents", () => {
  for (const coordinate of [1e30, -1e30, Number.MAX_SAFE_INTEGER * 256]) {
    for (const axis of ["x", "y"] as const) {
      const index = new SpatialIndex();
      const rect = { x: 0, y: 0, width: 120, height: 80, [axis]: coordinate };
      index.insert("extreme", rect);
      index.insert("ordinary", { x: 0, y: 0, width: 120, height: 80 });
      assert.deepEqual(index.query(rect), ["extreme"]);
      assert.deepEqual(index.query({ x: 0, y: 0, width: 1, height: 1 }), [
        "ordinary",
      ]);
      index.clear();
      assert.deepEqual(index.query(rect), []);
    }
  }
  const index = new SpatialIndex();
  const overflowing = {
    x: Number.MAX_VALUE,
    y: Number.MAX_VALUE,
    width: Number.MAX_VALUE,
    height: Number.MAX_VALUE,
  };
  index.insert("overflowing", overflowing);
  assert.deepEqual(index.query(overflowing), ["overflowing"]);
  index.insert("ordinary", { x: 0, y: 0, width: 120, height: 80 });
  assert.deepEqual(
    index.query({ x: -1e30, y: -1e30, width: 2e30, height: 2e30 }),
    ["ordinary"],
  );
});
