import assert from "node:assert/strict";
import { GraphDocument, NodeRegistry } from "../src/core/index.ts";
import { Runner, SKIP } from "../src/runtime/index.ts";

function setup() {
  const registry = new NodeRegistry()
    .register({
      type: "number",
      title: "Number",
      defaults: { value: 10 },
      ports: [{ id: "value", direction: "output", dataType: "number" }],
    })
    .register({
      type: "multiply",
      title: "Multiply",
      defaults: { factor: 2 },
      ports: [
        { id: "value", direction: "input", dataType: "number" },
        { id: "value", direction: "output", dataType: "number" },
      ].map((port, i) => ({ ...port, id: i ? "result" : "value" })) as any,
    })
    .register({
      type: "branch",
      title: "Branch",
      ports: [
        { id: "value", direction: "input", dataType: "number" },
        { id: "yes", direction: "output", dataType: "number" },
        { id: "no", direction: "output", dataType: "number" },
      ],
    })
    .register({
      type: "trigger",
      title: "Trigger",
      ports: [{ id: "value", direction: "output", dataType: "number" }],
    })
    .register({
      type: "wait",
      title: "Wait",
      ports: [
        { id: "value", direction: "input", dataType: "number" },
        { id: "result", direction: "output", dataType: "number" },
      ],
    });
  const document = new GraphDocument(registry),
    calls: string[] = [];
  const runner = new Runner(registry)
    .register("number", ({ data }) => {
      calls.push("source");
      return { value: data.value };
    })
    .register("multiply", ({ inputs, data }) => ({
      result: Number(inputs.value) * Number(data.factor),
    }))
    .register("branch", ({ inputs }) => ({ yes: inputs.value, no: SKIP }))
    .register("trigger", ({ triggerPayload }) => ({ value: triggerPayload }), {
      trigger: true,
    });
  return { registry, document, runner, calls };
}
Deno.test("evaluates a shared upstream node once and awaits asynchronous nodes", async () => {
  const { document, runner, calls } = setup();
  runner.register("wait", async ({ inputs }) => {
    await new Promise((resolve) => setTimeout(resolve, 2));
    return { result: inputs.value };
  });
  document.transaction("Graph", () => {
    document.addNode({ id: "source", type: "number" });
    document.addNode({ id: "multiply", type: "multiply" });
    document.addNode({ id: "wait", type: "wait" });
    for (const id of ["multiply", "wait"]) {
      document.connect(
        { nodeId: "source", portId: "value" },
        { nodeId: id, portId: "value" },
      );
    }
  });
  const run = runner.run(document.snapshot()),
    result = await run.result;
  assert.equal(result.status, "completed");
  assert.deepEqual(calls, ["source"]);
  assert.equal(result.nodes['["multiply"]'].outputs.result, 20);
  assert.equal(result.nodes['["wait"]'].outputs.result, 10);
  assert.equal(run.events.at(-1)?.status, "completed");
});
Deno.test("skips inactive branches without executing their effects", async () => {
  const { document, runner } = setup();
  document.transaction("Branches", () => {
    document.addNode({ id: "source", type: "number" });
    document.addNode({ id: "branch", type: "branch" });
    document.connect(
      { nodeId: "source", portId: "value" },
      { nodeId: "branch", portId: "value" },
    );
    for (const name of ["yes", "no"]) {
      document.addNode({ id: name, type: "multiply" });
      document.connect(
        { nodeId: "branch", portId: name },
        { nodeId: name, portId: "value" },
      );
    }
  });
  const result = await runner.run(document.snapshot()).result;
  assert.equal(result.nodes['["no"]'].status, "skipped");
  assert.equal(result.nodes['["yes"]'].outputs.result, 20);
});
Deno.test("takes a detached snapshot and rejects concurrent runs", async () => {
  const { document, runner } = setup();
  document.addNode({ id: "n", type: "number" });
  const run = runner.run(document.snapshot());
  assert.throws(
    () => runner.run(document.snapshot()),
    new RegExp("active run"),
  );
  document.dispatch({
    type: "update-node",
    nodeId: "n",
    changes: { data: { value: 99 } },
  });
  assert.equal((await run.result).nodes['["n"]'].outputs.value, 10);
});
Deno.test("requires an explicit application trigger", async () => {
  const { document, runner } = setup();
  document.addNode({ id: "trigger", type: "trigger" });
  assert.equal(
    (await runner.run(document.snapshot()).result).nodes['["trigger"]']
      .status,
    "skipped",
  );
  assert.equal(
    (await runner.trigger(document.snapshot(), "trigger", 42).result).nodes[
      '["trigger"]'
    ].outputs.value,
    42,
  );
});
Deno.test("supports nested instances with isolated results", async () => {
  const { document, runner } = setup();
  document.addNode({ id: "source", type: "number" });
  document.addNode({ id: "multiply", type: "multiply" });
  document.addNode({ id: "last", type: "multiply" });
  document.connect(
    { nodeId: "source", portId: "value" },
    { nodeId: "multiply", portId: "value" },
  );
  document.connect(
    { nodeId: "multiply", portId: "result" },
    { nodeId: "last", portId: "value" },
  );
  const instance = document.createSubgraph(["multiply"]);
  const result = await runner.run(document.snapshot()).result;
  assert.equal(result.status, "completed");
  assert.equal(
    result.nodes[JSON.stringify([instance, "multiply"])].outputs.result,
    20,
  );
  assert.equal(result.nodes['["last"]'].outputs.result, 40);
});
Deno.test("rejects cycles and missing inputs before running", () => {
  const { document, runner } = setup();
  document.addNode({ id: "a", type: "multiply" });
  assert.throws(
    () => runner.run(document.snapshot()),
    new RegExp("Missing required input"),
  );
  document.connect(
    { nodeId: "a", portId: "result" },
    { nodeId: "a", portId: "value" },
  );
  assert.throws(() => runner.run(document.snapshot()), new RegExp("cycle"));
});
Deno.test("cancels an unresolved executor and releases the runner", async () => {
  const { document, runner } = setup();
  let signal: AbortSignal | undefined;
  runner.register("wait", (context) => {
    signal = context.signal;
    return new Promise(() => {});
  });
  document.addNode({ id: "w", type: "wait", data: { value: 1 } });
  const run = runner.run(document.snapshot());
  await new Promise((resolve) => setTimeout(resolve, 2));
  run.cancel();
  assert.equal((await run.result).status, "cancelled");
  assert.equal(signal?.aborted, true);
  assert.equal(runner.running, false);
});
Deno.test("fails on timeout, execution limit, and errors without retrying", async () => {
  const { document, runner } = setup();
  let calls = 0;
  runner.register("wait", () => {
    calls++;
    return new Promise(() => {});
  });
  document.addNode({ id: "w", type: "wait", data: { value: 1 } });
  assert.ok(
    (await runner.run(document.snapshot(), { timeoutMs: 5 }).result).error
      ?.includes("timed out"),
  );
  assert.equal(calls, 1);
  const next = setup();
  next.document.addNode({ type: "number" });
  next.document.addNode({ type: "number" });
  assert.ok(
    (
      await next.runner.run(next.document.snapshot(), { maxExecutions: 1 })
        .result
    ).error?.includes("limit"),
  );
  const errorCase = setup();
  errorCase.runner.register("wait", () => {
    throw new Error("Action failed");
  });
  errorCase.document.addNode({ type: "wait", data: { value: 1 } });
  assert.equal(
    (await errorCase.runner.run(errorCase.document.snapshot()).result).error,
    "Action failed",
  );
});
