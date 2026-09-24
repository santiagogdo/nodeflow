import assert from "node:assert/strict";
import { GraphDocument } from "../src/core/index.ts";
import { createRegistry, createRunner } from "../examples/workbench/nodes.ts";
import { examples, seed } from "../examples/workbench/fixtures.ts";

for (const { id, label } of examples) {
  Deno.test(`loads and serializes ${label}`, () => {
    const registry = createRegistry(),
      document = new GraphDocument(registry, {
        initialState: seed(id, registry),
      });
    assert.equal(
      new GraphDocument(registry, {
        initialState: document.serialize(),
      }).serialize(),
      document.serialize(),
    );
  });
}
Deno.test("executes the order pipeline and its nested transform", async () => {
  const registry = createRegistry();
  const result = await createRunner(registry).run(seed("pipeline", registry))
    .result;
  assert.equal(result.status, "completed");
  assert.deepEqual(result.nodes['["table"]'].outputs.rows, [
    { id: 1042, customer: "Ana", total: 180 },
    { id: 1044, customer: "Luis", total: 240 },
    { id: 1046, customer: "Maya", total: 125 },
  ]);
  assert.equal(result.nodes['["transform","output"]'].status, "completed");
});
Deno.test("uses configured operands in visual programming", async () => {
  const registry = createRegistry();
  const result = await createRunner(registry).run(
    seed("programming", registry),
  ).result;
  assert.equal(result.nodes['["result"]'].outputs.value, 30);
});
