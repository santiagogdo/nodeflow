import assert from "node:assert/strict";
import { createPreset, GraphDocument, NodeRegistry } from "../src/index.ts";
import { defaultPreset } from "../src/presets/index.ts";
import { unstyledPreset } from "../src/presets/unstyled.ts";
import { buildGeometry } from "../src/editor/geometry.ts";

Deno.test("preset node, port and connection defaults compose independently without shared mutations", () => {
  const registry = new NodeRegistry().register({
    type: "x",
    title: "X",
    ports: [
      { id: "in", direction: "input", dataType: "any" },
      { id: "out", direction: "output", dataType: "any" },
    ],
  });
  const doc = new GraphDocument(registry);
  doc.addNode({ id: "a", type: "x" });
  doc.addNode({ id: "b", type: "x", position: { x: 400, y: 0 } });
  const edge = doc.connect({ nodeId: "a", portId: "out" }, {
    nodeId: "b",
    portId: "in",
  });
  const preset = createPreset(unstyledPreset, {
    nodes: {
      theme: { accent: "coral" },
      style: { labelSize: 27 },
    },
    ports: {
      style: { radius: 13, labelSize: 9 },
    },
    connections: {
      style: { width: 7, dash: [2, 3] },
    },
  });
  const scene = buildGeometry(
    doc,
    doc.snapshot().graphs.root,
    new Map(),
    new Map(),
    true,
    preset.theme,
    { preset },
  );
  const node = scene.nodes.get("a")!;
  assert.equal(node.appearance.style.labelSize, 27);
  assert.equal(node.appearance.style.controlHeight, 32); // No implicit touch preset.
  assert.equal(node.appearance.style.refraction, 0);
  assert.equal(node.appearance.theme.accent, "coral");
  assert.equal(node.portAppearances.get("out")!.style.radius, 13);
  assert.equal(node.portAppearances.get("out")!.style.labelSize, 9);
  assert.equal(scene.connectionAppearances.get(edge)!.style.width, 7);
  assert.equal(scene.pendingAppearance.style.width, 7);
  const motion = scene.connectionAppearances.get(edge)!.motion;
  assert.ok(motion && motion.duration === 0 && motion.flowSpeed === 0);
  node.appearance.style.radius = 99;
  node.portAppearances.get("out")!.style.radius = 99;
  (scene.pendingAppearance.style.dash as number[])[0] = 99;
  assert.equal(preset.nodes.style.radius, 0);
  assert.equal(preset.ports.style.radius, 13);
  assert.deepEqual(preset.connections.style.dash, [2, 3]);
  assert.deepEqual(scene.connectionAppearances.get(edge)!.style.dash, [2, 3]);
  assert.equal(defaultPreset.nodes.style.refraction, 10);
  assert.ok(Object.isFrozen(defaultPreset.theme.portColors));
  assert.ok(Object.isFrozen(defaultPreset.connections.style.dash));
});

Deno.test("derived presets inherit nested settings, replace arrays and callbacks, and can be extended again", () => {
  const baseDraw = () => {};
  const base = createPreset(defaultPreset, {
    theme: { portColors: { orders: "orange", errors: "red" } },
    nodes: {
      theme: { portColors: { orders: "gold", errors: "crimson" } },
      touchStyle: { controlHeight: 48 },
      ports: { style: { labelSize: 18 }, motion: { duration: 120 } },
      draw: baseDraw,
    },
    connections: { style: { dash: [3, 5] } },
  });
  const connectionDraw = () => {};
  const derived = createPreset(base, {
    theme: {
      accent: "teal",
      canvas: undefined,
      portColors: { orders: "green" },
    },
    nodes: {
      style: { radius: 12 },
      theme: { portColors: { orders: "lime" } },
      touchStyle: { headerHeight: 64 },
      motion: { duration: 90 },
      ports: { style: { radius: 8 }, motion: { easing: (t) => t } },
      draw: undefined,
    },
    ports: { touchStyle: { radius: 9 }, motion: { duration: 80 } },
    connections: { style: { dash: [] }, draw: connectionDraw },
    menu: { rowHeight: 40 },
  });
  assert.equal(derived.theme.accent, "teal");
  assert.equal(derived.theme.canvas, defaultPreset.theme.canvas);
  assert.equal(derived.theme.portColors.orders, "green");
  assert.equal(derived.theme.portColors.errors, "red");
  assert.equal(derived.nodes.theme?.portColors?.orders, "lime");
  assert.equal(derived.nodes.theme?.portColors?.errors, "crimson");
  assert.equal(derived.nodes.touchStyle?.controlHeight, 48);
  assert.equal(derived.nodes.touchStyle?.headerHeight, 64);
  assert.equal(derived.nodes.ports?.style?.radius, 8);
  assert.equal(derived.nodes.ports?.style?.labelSize, 18);
  assert.ok(derived.nodes.ports?.motion);
  assert.equal(derived.nodes.ports.motion.duration, 120);
  assert.equal(derived.nodes.motion.duration, 90);
  assert.equal(derived.nodes.motion.easing, base.nodes.motion.easing);
  assert.equal(derived.ports.touchStyle?.labelSize, 15);
  assert.equal(derived.ports.touchStyle?.radius, 9);
  assert.equal(derived.ports.motion.duration, 80);
  assert.equal(derived.menu.touchRowHeight, base.menu.touchRowHeight);
  assert.equal(derived.menu.rowHeight, 40);
  assert.equal(derived.nodes.draw, baseDraw);
  assert.equal(derived.connections.draw, connectionDraw);
  assert.equal(derived.createPainter, base.createPainter);
  assert.deepEqual(derived.connections.style.dash, []);
  assert.deepEqual(base.connections.style.dash, [3, 5]);
  const customFactory = () => ({});
  const custom = createPreset(derived, {
    createPainter: customFactory,
    ports: { style: { color: "blue" } },
  });
  assert.equal(custom.createPainter, customFactory);
  assert.equal(
    createPreset(custom, { ports: { style: { color: null } } }).ports.style
      .color,
    null,
  );
});

Deno.test("preset configuration is snapshotted and frozen without freezing caller-owned inputs", () => {
  const colors = { number: "orange" };
  const dash = [2, 4];
  const touchStyle = { radius: 16 };
  const ports = { style: { radius: 6 }, motion: { duration: 80 } };
  const preset = createPreset(defaultPreset, {
    theme: { portColors: colors },
    nodes: { touchStyle, ports },
    connections: { style: { dash } },
  });
  colors.number = "purple";
  dash.push(6);
  touchStyle.radius = 99;
  ports.style.radius = 99;
  assert.equal(preset.theme.portColors.number, "orange");
  assert.deepEqual(preset.connections.style.dash, [2, 4]);
  assert.equal(preset.nodes.touchStyle?.radius, 16);
  assert.equal(preset.nodes.ports?.style?.radius, 6);
  for (
    const value of [
      preset,
      preset.theme,
      preset.theme.portColors,
      preset.nodes,
      preset.nodes.style,
      preset.nodes.motion,
      preset.nodes.ports,
      preset.nodes.ports?.style,
      preset.nodes.ports?.motion,
      preset.connections.style.dash,
    ]
  ) assert.ok(Object.isFrozen(value));
  const copy = createPreset(preset);
  assert.deepEqual(copy, preset);
  assert.notEqual(copy.nodes.style, preset.nodes.style);
  assert.notEqual(copy.connections.style.dash, preset.connections.style.dash);
});
