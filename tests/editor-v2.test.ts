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
