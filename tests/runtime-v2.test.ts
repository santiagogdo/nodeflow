import assert from "node:assert/strict";
import { emptyGraph, GraphDocument, NodeRegistry } from "../src/core/index.ts";
import { Runner, SKIP } from "../src/runtime/index.ts";

function fanout(count: number) {
  const graph = emptyGraph("root");
  graph.inputs = [{ id: "i", dataType: "number", defaultValue: 0 }];
  graph.outputs = [{ id: "o", dataType: "number" }];
  graph.nodes.source = {
    id: "source",
    type: "@input",
    label: "Input",
    data: { portId: "i" },
    position: { x: 0, y: 0 },
  };
  for (let i = 0; i < count; i++) {
    const id = `sink${String(i).padStart(4, "0")}`, edgeId = `e${i}`;
    graph.nodes[id] = {
      id,
      type: "@output",
      label: "Output",
      data: { portId: "o" },
      position: { x: 0, y: 0 },
    };
    graph.connections[edgeId] = {
      id: edgeId,
      source: { nodeId: "source", portId: "value" },
      target: { nodeId: id, portId: "value" },
    };
  }
  return new GraphDocument(new NodeRegistry(), {
    initialState: { version: 2, rootGraphId: "root", graphs: { root: graph } },
  }).snapshot();
}

Deno.test("compiles built-in fanout without per-input edge scans or growing queue sorts", () => {
  const count = 256,
    snapshot = fanout(count),
    runner = new Runner(new NodeRegistry());
  const values = Object.values, sort = Array.prototype.sort;
  let edgeVisits = 0, sortedItems = 0;
  Object.values = ((value: object) => {
    const result = values(value);
    if (result.length === count && result[0]?.source?.nodeId === "source") {
      edgeVisits += result.length;
    }
    return result;
  }) as typeof Object.values;
  Array.prototype.sort = function (compare) {
    if (
      this.length && typeof this[0] === "string" &&
      (this[0] === "source" || this[0].startsWith("sink"))
    ) sortedItems += this.length;
    return sort.call(this, compare);
  };
  let order: string[];
  try {
    order = runner.compile(snapshot).order.get("root")!;
  } finally {
    Object.values = values;
    Array.prototype.sort = sort;
  }
  assert.deepEqual(order, [
    "source",
    ...Object.keys(snapshot.graphs.root.nodes).filter((id) => id !== "source")
      .sort(),
  ]);
  assert.ok(edgeVisits <= count * 8, `enumerated ${edgeVisits} edges`);
  assert.ok(sortedItems <= count * 4, `sorted ${sortedItems} queue items`);
});

Deno.test("pre-aborted runs skip snapshot traversal and return a reusable cancelled handle", async () => {
  const snapshot = fanout(4), controller = new AbortController();
  controller.abort(new Error("Already cancelled"));
  let calls = 0;
  class Registry extends NodeRegistry {
    override ports(...args: Parameters<NodeRegistry["ports"]>) {
      calls++;
      return super.ports(...args);
    }
  }
  const runner = new Runner(new Registry());
  const run = runner.run(snapshot, { signal: controller.signal });
  const result = await run.result;
  assert.equal(calls, 0);
  assert.equal(result.status, "cancelled");
  assert.match(result.error!, /Already cancelled/);
  assert.equal(run.events.at(-1)?.status, "cancelled");
  assert.equal(runner.running, false);
  assert.equal((await runner.run(snapshot).result).status, "completed");
});

Deno.test("compilation indexes distinct built-in interface ports per snapshot", () => {
  const count = 256, graph = emptyGraph("root"), registry = new NodeRegistry();
  for (let i = 0; i < count; i++) {
    graph.outputs.push({ id: `p${i}`, dataType: "number", defaultValue: i });
    graph.nodes[`n${i}`] = {
      id: `n${i}`,
      type: "@output",
      label: "Output",
      data: { portId: `p${i}` },
      position: { x: 0, y: 0 },
    };
  }
  const snapshot = {
    version: 2 as const,
    rootGraphId: "root",
    graphs: { root: graph },
  };
  const find = Array.prototype.find;
  let comparisons = 0;
  Array.prototype.find = function (
    this: unknown[],
    predicate: (value: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ) {
    return find.call(this, (value, index, array) => {
      if (
        this.length === count && value && typeof value === "object" &&
        "dataType" in value && value.dataType === "number"
      ) comparisons++;
      return predicate.call(thisArg, value, index, array);
    });
  } as typeof Array.prototype.find;
  try {
    assert.equal(
      new Runner(registry).compile(snapshot).order.get("root")!.length,
      count,
    );
  } finally {
    Array.prototype.find = find;
  }
  assert.ok(
    comparisons <= count * 4,
    `compared ${comparisons} interface ports`,
  );
  // Ordinary registry calls must observe edits rather than reuse a stale index.
  graph.outputs[0].defaultValue = 99;
  assert.equal(
    registry.ports(graph.nodes.n0, graph, snapshot)[0].defaultValue,
    99,
  );
  graph.outputs[0].id = "replacement";
  assert.throws(
    () => registry.ports(graph.nodes.n0, graph, snapshot),
    /Unknown graph interface port/,
  );
});

Deno.test("run deadlines cover validation and compilation before any executor starts", async () => {
  const count = 16, snapshot = fanout(count);
  for (const expireAfter of [1, count * 3 + 2]) {
    let calls = 0, time = 0;
    class Registry extends NodeRegistry {
      override ports(...args: Parameters<NodeRegistry["ports"]>) {
        if (++calls === expireAfter) time = 2;
        return super.ports(...args);
      }
    }
    const runner = new Runner(new Registry()), now = performance.now;
    let run;
    performance.now = () => time;
    try {
      run = runner.run(snapshot, { timeoutMs: 1 });
    } finally {
      performance.now = now;
    }
    const result = await run.result;
    assert.ok(calls <= expireAfter);
    assert.equal(result.status, "failed");
    assert.match(result.error!, /timed out/);
    assert.deepEqual(result.nodes, {});
    assert.equal(runner.running, false);
  }
});

Deno.test("ready nodes retain lexical order when new nodes become ready", () => {
  const { document, runner } = setup();
  document.transaction("Ordering", () => {
    for (const id of ["b", "A", "a", "Z"]) {
      document.addNode({ id, type: "number" });
    }
    document.addNode({ id: "!", type: "multiply" });
    document.connect({ nodeId: "A", portId: "value" }, {
      nodeId: "!",
      portId: "value",
    });
  });
  assert.deepEqual(runner.compile(document.snapshot()).order.get("root"), [
    "A",
    "!",
    "Z",
    "a",
    "b",
  ]);
});

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
