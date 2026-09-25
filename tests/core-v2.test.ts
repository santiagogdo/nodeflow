import assert from "node:assert/strict";
import { emptyGraph, GraphDocument, NodeRegistry } from "../src/core/index.ts";
import type { GraphCommand } from "../src/core/index.ts";

export function registry() {
  return new NodeRegistry()
    .register({
      type: "number",
      title: "Number",
      defaults: { value: 1 },
      ports: [{ id: "value", direction: "output", dataType: "number" }],
      validate: (data) => {
        if (typeof data.value !== "number") {
          throw new Error("Expected a number");
        }
      },
    })
    .register({
      type: "add",
      title: "Add",
      defaults: { b: 2 },
      ports: [
        { id: "a", direction: "input", dataType: "number" },
        { id: "b", direction: "input", dataType: "number" },
        { id: "value", direction: "output", dataType: "number" },
      ],
    })
    .register({
      type: "text",
      title: "Text",
      defaults: { value: "" },
      ports: [{ id: "value", direction: "output", dataType: "string" }],
    });
}
function connected() {
  const document = new GraphDocument(registry());
  document.transaction("Seed", () => {
    document.addNode({ id: "a", type: "number" });
    document.addNode({ id: "b", type: "add", position: { x: 300, y: 0 } });
    document.connect(
      { nodeId: "a", portId: "value" },
      { nodeId: "b", portId: "a" },
    );
  });
  return document;
}

Deno.test("command selectors reject inherited records without mutating shared prototypes", () => {
  for (
    const id of [
      "__proto__",
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
    ]
  ) {
    const commands: GraphCommand[] = [
      { type: "rename-graph", graphId: id, label: "polluted" },
      { type: "set-interface", graphId: id, inputs: [], outputs: [] },
      { type: "update-node", nodeId: id, changes: { label: "polluted" } },
      { type: "move-nodes", positions: { [id]: { x: 1, y: 2 } } },
      { type: "update-group", groupId: id, changes: { parentId: "missing" } },
    ];
    for (const command of commands) {
      const document = connected(), before = document.serialize();
      const revision = document.revision,
        canUndo = document.canUndo,
        canRedo = document.canRedo;
      let notifications = 0;
      document.subscribe(() => notifications++);
      const target = id === "__proto__"
        ? Object.prototype
        : Reflect.get(Object.prototype, id) as object;
      const descriptors = Object.getOwnPropertyDescriptors(target);
      let after: PropertyDescriptorMap;
      let rejected = false;
      try {
        document.dispatch(JSON.parse(JSON.stringify(command)));
      } catch {
        rejected = true;
      } finally {
        after = Object.getOwnPropertyDescriptors(target);
        // The vulnerable baseline must not contaminate later tests.
        for (const key of Reflect.ownKeys(target)) {
          if (!Object.hasOwn(descriptors, key)) {
            Reflect.deleteProperty(target, key);
          }
        }
        Object.defineProperties(target, descriptors);
      }
      assert.deepEqual(after, descriptors, `${command.type}: ${id}`);
      assert.ok(rejected, `${command.type}: ${id} must be rejected`);
      assert.equal(document.serialize(), before);
      assert.equal(document.revision, revision);
      assert.equal(document.canUndo, canUndo);
      assert.equal(document.canRedo, canRedo);
      assert.equal(notifications, 0);
    }
  }
});

Deno.test("selector failure poisons a caught transaction and guards temporary group parents", () => {
  const document = connected();
  document.dispatch({
    type: "add-group",
    group: { id: "g", label: "Group", nodeIds: ["a"] },
  });
  const before = document.serialize();
  assert.throws(() =>
    document.transaction("Caught selector", () => {
      document.dispatch({ type: "rename-graph", label: "Changed" });
      try {
        document.dispatch({
          type: "update-group",
          groupId: "toString",
          changes: {},
        });
      } catch { /* The transaction must still fail. */ }
    })
  );
  assert.equal(document.serialize(), before);
  assert.throws(() =>
    document.transaction("Temporary parent", () => {
      document.dispatch({
        type: "update-group",
        groupId: "g",
        changes: { parentId: "__proto__" },
      });
      document.dispatch({ type: "ungroup", groupId: "g" });
    }), /Group does not exist/);
  assert.equal(document.serialize(), before);
});

Deno.test("own Object-method IDs and prototype-named JSON metadata remain usable", () => {
  const document = new GraphDocument(registry());
  document.dispatch({ type: "add-graph", graph: emptyGraph("hasOwnProperty") });
  document.dispatch({
    type: "rename-graph",
    graphId: "hasOwnProperty",
    label: "Own graph",
  });
  document.dispatch({
    type: "add-node",
    node: { id: "toString", type: "number" },
  });
  document.dispatch({
    type: "move-nodes",
    positions: { toString: { x: 7, y: 9 } },
  });
  document.dispatch({
    type: "update-node",
    nodeId: "toString",
    changes: { label: "Own node" },
  });
  document.dispatch({
    type: "add-group",
    group: { id: "valueOf", label: "Own group", nodeIds: ["toString"] },
  });
  document.dispatch({
    type: "update-group",
    groupId: "valueOf",
    changes: JSON.parse(
      '{"label":"Updated","__proto__":{"parentId":"missing"}}',
    ),
  });
  const groupId: string = "valueOf", nodeId: string = "toString";
  const group = document.snapshot().graphs.root.groups[groupId];
  assert.equal(group.label, "Updated");
  assert.equal(Object.getPrototypeOf(group), Object.prototype);
  assert.equal(Object.hasOwn(group, "__proto__"), true);
  assert.equal(group.parentId, undefined);
  assert.deepEqual(document.snapshot().graphs.root.nodes[nodeId].position, {
    x: 7,
    y: 9,
  });
  const before = document.serialize();
  for (const groupId of ["__proto__", "missing", "constructor", "toString"]) {
    document.dispatch({ type: "ungroup", groupId });
  }
  assert.equal(document.serialize(), before);
  document.dispatch({ type: "ungroup", groupId: "valueOf" });
  document.undo();
  assert.equal(document.serialize(), before);
  document.redo();
  assert.equal(
    Object.hasOwn(document.snapshot().graphs.root.groups, "valueOf"),
    false,
  );
  const fragment = document.copy(["toString"]);
  assert.equal(document.paste(fragment, "hasOwnProperty").length, 1);
  assert.throws(
    () => document.paste(fragment, "__proto__"),
    /Graph does not exist/,
  );
  assert.throws(() => document.copy([], "toString"), /Graph does not exist/);
  assert.throws(
    () => document.createSubgraph(["toString"], "__proto__"),
    /Graph does not exist/,
  );
  assert.throws(
    () => document.createSubgraph(["valueOf"]),
    /Select at least one node/,
  );
  assert.ok(document.createSubgraph(["toString"]));
});
Deno.test("validates commands atomically, including a caught failure inside a transaction", () => {
  const document = connected(),
    before = document.serialize();
  assert.throws(() =>
    document.transaction("Bad edit", () => {
      document.addNode({ type: "number" });
      try {
        document.addNode({ id: "a", type: "number" });
      } catch {
        /* Caller cannot accidentally commit the rest. */
      }
    })
  );
  assert.equal(document.serialize(), before);
  assert.throws(() =>
    document.dispatch({
      type: "move-nodes",
      positions: { a: { x: Infinity, y: 0 } },
    })
  );
  assert.equal(document.serialize(), before);
});
Deno.test("undoes and redoes a compound edit with stable IDs", () => {
  const document = connected(),
    before = document.serialize();
  document.transaction("Move and rename", () => {
    document.dispatch({
      type: "move-nodes",
      positions: { a: { x: 40, y: 40 }, b: { x: 400, y: 60 } },
    });
    document.dispatch({
      type: "update-node",
      nodeId: "a",
      changes: { label: "Source" },
    });
  });
  const after = document.serialize();
  document.undo();
  assert.equal(document.serialize(), before);
  document.redo();
  assert.equal(document.serialize(), after);
});
Deno.test("restores incident connections and group membership when undoing deletion", () => {
  const document = connected();
  document.dispatch({
    type: "add-group",
    group: { id: "g", label: "Pair", nodeIds: ["a", "b"] },
  });
  const before = document.serialize();
  document.dispatch({ type: "remove", nodeIds: ["a"] });
  assert.equal(
    (Object.keys(document.snapshot().graphs.root.connections)).length,
    0,
  );
  document.undo();
  assert.equal(document.serialize(), before);
});
Deno.test("enforces endpoint membership, types, duplicate pairs, and input cardinality", () => {
  const document = connected(),
    target = { nodeId: "b", portId: "a" };
  document.addNode({ id: "text", type: "text" });
  document.addNode({ id: "other", type: "number" });
  for (
    const source of [
      { nodeId: "a", portId: "value" },
      { nodeId: "text", portId: "value" },
      { nodeId: "other", portId: "value" },
      { nodeId: "missing", portId: "value" },
    ]
  ) {
    assert.throws(() => document.connect(source, target));
  }
  assert.throws(() =>
    document.connect(
      { portId: "value", nodeId: "other" },
      { portId: "a", nodeId: "b" },
    ), new RegExp("already connected"));
});
Deno.test("rejects invalid imports before changing state or history", () => {
  const document = connected(),
    before = document.serialize();
  for (
    const state of [
      { version: 1 },
      { ...document.snapshot(), rootGraphId: "nope" },
      { ...document.snapshot(), graphs: null },
    ]
  ) {
    assert.throws(() => document.load(state));
  }
  assert.equal(document.serialize(), before);
  assert.equal(document.canUndo, true);
  document.load(before);
  assert.equal(document.canUndo, false);
  assert.equal(document.serialize(), before);
});
Deno.test("exposes immutable snapshots, detached imported data, and one event per transaction", () => {
  const document = new GraphDocument(registry()),
    events: string[] = [];
  const unsubscribe = document.subscribe((event) => events.push(event.label));
  document.transaction("Two nodes", () => {
    document.addNode({ type: "number" });
    document.addNode({ type: "number" });
  });
  assert.deepEqual(events, ["Two nodes"]);
  assert.throws(() => {
    (document.snapshot().graphs.root.label as unknown as string) = "Changed";
  });
  unsubscribe();
  document.undo();
  assert.equal(events.length, 1);
});
Deno.test("remaps clipboard IDs and connections together", () => {
  const document = connected(),
    fragment = document.copy(["a", "b"]),
    ids = document.paste(fragment);
  assert.equal(ids.length, 2);
  assert.ok(!ids.includes("a"));
  const graph = document.snapshot().graphs.root;
  const pasted = Object.values(graph.connections).find((edge) =>
    ids.includes(edge.source.nodeId)
  )!;
  assert.ok(ids.includes(pasted.target.nodeId));
  assert.equal(graph.nodes[ids[0]].position.x, 32);
  document.undo();
  assert.equal((Object.keys(document.snapshot().graphs.root.nodes)).length, 2);
});
Deno.test("preserves complete nested groups through clipboard and extraction", () => {
  const document = connected();
  document.transaction("Nested groups", () => {
    document.dispatch({
      type: "add-group",
      group: { id: "parent", label: "Parent", nodeIds: [] },
    });
    document.dispatch({
      type: "add-group",
      group: {
        id: "child",
        label: "Child",
        nodeIds: ["a", "b"],
        parentId: "parent",
      },
    });
  });
  const fragment = document.copy(["a", "b"]);
  assert.equal(fragment.groups.length, 2);
  document.paste(fragment);
  assert.equal((Object.keys(document.snapshot().graphs.root.groups)).length, 4);
  document.undo();
  const before = document.serialize(),
    instance = document.createSubgraph(["a", "b"]);
  const nested = document.snapshot().graphs[
    document.snapshot().graphs.root.nodes[instance].subgraphId!
  ];
  assert.equal(nested.groups.child.parentId, "parent");
  assert.equal((Object.keys(document.snapshot().graphs.root.groups)).length, 0);
  document.undo();
  assert.equal(document.serialize(), before);
});
Deno.test("extracts a reusable subgraph while preserving its external wiring", () => {
  const document = connected();
  document.addNode({ id: "c", type: "add" });
  document.connect(
    { nodeId: "b", portId: "value" },
    { nodeId: "c", portId: "a" },
  );
  const before = document.serialize(),
    instance = document.createSubgraph(["b"]);
  const state = document.snapshot(),
    nested = state.graphs[state.graphs.root.nodes[instance].subgraphId!];
  assert.equal(nested.inputs.length, 1);
  assert.equal(nested.outputs.length, 1);
  assert.notEqual(nested.nodes.b, undefined);
  assert.equal(state.graphs.root.nodes.b, undefined);
  assert.equal(
    Object.values(state.graphs.root.connections).some(
      (edge) => edge.target.nodeId === instance,
    ),
    true,
  );
  const roundtrip = new GraphDocument(registry(), {
    initialState: document.serialize(),
  });
  assert.equal(roundtrip.serialize(), document.serialize());
  document.undo();
  assert.equal(document.serialize(), before);
});
Deno.test("rejects recursive subgraphs and invalid group hierarchies", () => {
  const document = connected();
  assert.throws(
    () => document.addNode({ type: "@subgraph", subgraphId: "root" }),
    new RegExp("Recursive"),
  );
  assert.throws(() =>
    document.dispatch({
      type: "add-group",
      group: { id: "g", label: "Cycle", nodeIds: [], parentId: "g" },
    })
  );
  document.dispatch({ type: "add-graph", graph: emptyGraph("other") });
  document.addNode({ type: "@subgraph", subgraphId: "other" });
  assert.throws(() => document.dispatch({ type: "remove-graph", id: "other" }));
});
Deno.test("keeps graph cycles editable and bounds history", () => {
  const document = new GraphDocument(registry(), { historyLimit: 2 });
  document.addNode({ id: "a", type: "add" });
  document.addNode({ id: "b", type: "add" });
  document.connect(
    { nodeId: "a", portId: "value" },
    { nodeId: "b", portId: "a" },
  );
  document.connect(
    { nodeId: "b", portId: "value" },
    { nodeId: "a", portId: "a" },
  );
  document.undo();
  document.undo();
  assert.equal(document.canUndo, false);
  assert.equal((Object.keys(document.snapshot().graphs.root.nodes)).length, 2);
});
