import {
  darkTheme,
  defaultNodeMotion,
  defaultPreset,
} from "../src/presets/index.ts";
import assert from "node:assert/strict";
import { GraphDocument, NodeRegistry } from "../src/index.ts";
import { resolveAppearance } from "../src/editor/appearance.ts";
import { buildGeometry } from "../src/editor/geometry.ts";
import { NodeTransitions } from "../src/editor/motion.ts";

Deno.test("node appearance merges editor, type and instance tokens without losing port colors", () => {
  const global = {
    style: { radius: 20, padding: 24 },
    theme: { accent: "tomato", portColors: { number: "cyan" } },
  };
  const resolved = resolveAppearance(
    defaultPreset.nodes,
    darkTheme,
    false,
    global,
    {
      style: { radius: 10 },
      theme: { portColors: { records: "blue" } },
      motion: false,
    },
    { style: { padding: 30 }, theme: { accent: "hsl(120 80% 40%)" } },
  );
  assert.equal(resolved.style.radius, 10);
  assert.equal(resolved.style.padding, 30);
  assert.equal(resolved.theme.accent, "hsl(120 80% 40%)");
  assert.equal(resolved.theme.portColors.number, "cyan");
  assert.equal(resolved.theme.portColors.records, "blue");
  assert.equal(resolved.theme.portColors.any, darkTheme.portColors.any);
  assert.equal(resolved.motion, false);
  assert.equal(global.style.radius, 20);
  assert.throws(
    () =>
      resolveAppearance(defaultPreset.nodes, darkTheme, false, {
        style: { radius: NaN },
      }),
    /finite/,
  );
  assert.throws(
    () =>
      resolveAppearance(defaultPreset.nodes, darkTheme, false, {
        style: { opacity: 2 },
      }),
    /between/,
  );
  assert.throws(
    () =>
      resolveAppearance(defaultPreset.nodes, darkTheme, false, {
        motion: { duration: -1 },
      }),
    /durations/,
  );
});

Deno.test("custom layout drives bounds, connected ports, edges and spatial lookup", () => {
  const registry = new NodeRegistry().register({
    type: "x",
    title: "X",
    ports: [
      { id: "in", direction: "input", dataType: "any" },
      { id: "out", direction: "output", dataType: "any" },
    ],
  });
  const doc = new GraphDocument(registry);
  doc.addNode({ type: "x", id: "a" });
  doc.addNode({ type: "x", id: "b", position: { x: 400, y: 0 } });
  doc.connect({ nodeId: "a", portId: "out" }, { nodeId: "b", portId: "in" });
  const geometry = buildGeometry(
    doc,
    doc.snapshot().graphs.root,
    new Map(),
    new Map(),
    false,
    darkTheme,
    {
      preset: defaultPreset,
      nodeAppearance: (node) =>
        node.id === "a"
          ? {
            layout: (g) => ({
              ...g,
              bounds: { ...g.bounds, width: 300 },
              ports: g.ports.map((p) => ({ ...p, point: { x: 300, y: 50 } })),
            }),
          }
          : undefined,
    },
  );
  assert.equal(geometry.nodes.get("a")!.bounds.width, 300);
  assert.deepEqual([...geometry.edges.values()][0].source, { x: 300, y: 50 });
  assert.equal(geometry.nodes.get("a")!.ports[1].connected, true);
  assert.ok(
    geometry.nodeIndex.query({ x: 295, y: 0, width: 2, height: 2 }).includes(
      "a",
    ),
  );
});

Deno.test("motion reverses from its current value, settles and drops offscreen transitions", () => {
  const motion = {
    ...defaultNodeMotion,
    duration: 100,
    easing: (t: number) => t,
  };
  const transitions = new NodeTransitions();
  const sample = (target: number, now: number) => {
    transitions.begin();
    const value = transitions.value("hover", target, now, motion);
    transitions.end();
    return value;
  };
  assert.equal(sample(0, 0), 0);
  assert.equal(sample(1, 1), 0);
  assert.equal(transitions.active, true);
  assert.equal(sample(0, 51), 0.5);
  assert.equal(sample(0, 101), 0.25);
  assert.equal(sample(0, 151), 0);
  assert.equal(transitions.active, false);
  sample(1, 200);
  transitions.begin();
  transitions.end();
  assert.equal(sample(1, 220), 1); // Reappearing nodes do not resume stale motion.
  transitions.begin();
  assert.equal(transitions.value("hover", 0, 221, false), 0);
  assert.equal(transitions.active, false);
});

Deno.test("port and connection overrides merge, validate and leave caller inputs untouched", async () => {
  const { resolvePortAppearance, resolveConnectionAppearance } = await import(
    "../src/editor/linkAppearance.ts"
  );
  const port = resolvePortAppearance(defaultPreset.ports, false, {
    style: { color: "coral", radius: 9 },
    motion: false,
  }, { style: { radius: 12 } });
  assert.equal(port.style.color, "coral");
  assert.equal(port.style.radius, 12);
  assert.equal(port.motion, false);
  const dash = [2, 8];
  const edge = resolveConnectionAppearance(defaultPreset.connections, {
    style: { width: 4, dash },
    motion: false,
  }, { style: { color: "cyan" }, motion: { flowSpeed: 30 } });
  assert.equal(edge.style.width, 4);
  assert.equal(edge.style.color, "cyan");
  assert.ok(edge.motion && edge.motion.flowSpeed === 30);
  dash[0] = 100;
  assert.deepEqual(edge.style.dash, [2, 8]);
  assert.throws(
    () =>
      resolvePortAppearance(defaultPreset.ports, false, {
        style: { haloOpacity: 2 },
      }),
    /between/,
  );
  assert.throws(
    () =>
      resolvePortAppearance(defaultPreset.ports, false, {
        style: { radius: NaN },
      }),
    /finite/,
  );
  assert.throws(
    () =>
      resolveConnectionAppearance(defaultPreset.connections, {
        style: { dash: [Infinity] },
      }),
    /finite/,
  );
  assert.throws(
    () =>
      resolveConnectionAppearance(defaultPreset.connections, {
        motion: { flowSpeed: -1 },
      }),
    /finite/,
  );
});

Deno.test("connection routing and port appearance use shared geometry at every layer", () => {
  const registry = new NodeRegistry().register({
    type: "x",
    title: "X",
    ports: [{ id: "out", direction: "output", dataType: "any" }, {
      id: "in",
      direction: "input",
      dataType: "any",
    }],
  });
  const doc = new GraphDocument(registry);
  doc.addNode({ type: "x", id: "a" });
  doc.addNode({ type: "x", id: "b", position: { x: 400, y: 0 } });
  doc.connect({ nodeId: "a", portId: "out" }, { nodeId: "b", portId: "in" });
  const scene = buildGeometry(
    doc,
    doc.snapshot().graphs.root,
    new Map([["x", {
      type: "x",
      appearance: { ports: { style: { radius: 11 } } },
    }]]),
    new Map(),
    false,
    darkTheme,
    {
      preset: defaultPreset,
      ports: { style: { radius: 8, labelSize: 16 } },
      nodeAppearance: () => ({ ports: { style: { color: "blue" } } }),
      portAppearance: (node, port) =>
        node.id === "a" && port.id === "out"
          ? { style: { radius: 15 } }
          : undefined,
      connections: {
        geometry: (g) => ({
          ...g,
          c1: { x: 200, y: -120 },
          c2: { x: 300, y: -120 },
          samples: [{ x: 200, y: -120 }, { x: 300, y: -120 }],
          bounds: { x: 200, y: -120, width: 200, height: 220 },
        }),
      },
    },
  );
  assert.equal(
    scene.nodes.get("a")!.portAppearances.get("out")!.style.radius,
    15,
  );
  assert.equal(
    scene.nodes.get("b")!.portAppearances.get("in")!.style.radius,
    11,
  );
  assert.equal(
    scene.nodes.get("a")!.portAppearances.get("in")!.style.color,
    "blue",
  );
  assert.equal(
    scene.nodes.get("a")!.portAppearances.get("in")!.style.labelSize,
    16,
  );
  assert.equal(
    scene.edgeIndex.query({ x: 250, y: -122, width: 1, height: 1 }).length,
    1,
  );
  assert.equal([...scene.edges.values()][0].c1.y, -120);
  assert.throws(
    () =>
      buildGeometry(
        doc,
        doc.snapshot().graphs.root,
        new Map(),
        new Map(),
        false,
        darkTheme,
        {
          preset: defaultPreset,
          connections: { geometry: (g) => ({ ...g, c1: { x: NaN, y: 0 } }) },
        },
      ),
    /Invalid connection geometry/,
  );
});
