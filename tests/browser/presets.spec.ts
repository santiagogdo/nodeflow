import { expect, test } from "npm:@playwright/test@1.63.0";
import type {} from "./fixture.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => !!globalThis.nodeflowTest);
});

test("unstyled editor has no fallback pixels, effects or animation, including selection and empty state", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { network, unstyledPreset } = globalThis.nodeflowTest;
    const { editor, graph } = network({
      preset: unstyledPreset,
      theme: { canvas: "red", node: "blue", accent: "green" },
      nodes: { style: { refraction: 10, shadowBlur: 20 } },
      connections: { style: { width: 12 } },
    });
    editor.setSelection({
      nodes: ["a"],
      connections: Object.keys(graph.snapshot().graphs.root.connections),
    });
    editor.setRuntimeState({
      a: { status: "running", outputs: {}, path: ["a"] },
    });
    const blank = () => {
      editor.render();
      const canvas = editor.canvas;
      const data =
        canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height)
          .data;
      return !data.some((value, i) => i % 4 === 3 && value !== 0);
    };
    const results = [];
    for (const scale of [1, 0.3, 0.1]) {
      editor.setViewport({ scale });
      results.push(blank());
    }
    editor.setSelection({ nodes: ["a", "b", "c", "d"] });
    editor.deleteSelection();
    results.push(blank());
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    const frames = editor.metrics.frames;
    await new Promise((resolve) => setTimeout(resolve, 100));
    const idle = editor.metrics.frames === frames;
    editor.destroy();
    return { results, idle };
  });
  expect(result.results).toEqual([true, true, true, true]);
  expect(result.idle).toBe(true);
});

test("custom preset owns every zoom and its painter is isolated per editor and disposed", async ({ page }) => {
  const result = await page.evaluate(() => {
    const { network, unstyledPreset, createPreset } = globalThis.nodeflowTest;
    const calls: Record<string, Set<string>> = {
      node: new Set(),
      port: new Set(),
      connection: new Set(),
    };
    let created = 0, destroyed = 0;
    const base = createPreset(unstyledPreset, {
      createPainter() {
        const instance = ++created;
        return {
          background({ context: ctx, width, height }) {
            ctx.fillStyle = instance === 1 ? "#000000" : "#ffffff";
            ctx.fillRect(0, 0, width, height);
            ctx.translate(9000, 9000); // Must not affect later painters.
          },
          node(view, part) {
            if (part !== "surface") return;
            calls.node.add(view.detail);
            const { context: ctx, geometry: { bounds: b } } = view;
            ctx.fillStyle = view.theme.node;
            ctx.fillRect(b.x, b.y, b.width, b.height);
          },
          port(view) {
            calls.port.add(view.detail);
            view.context.fillStyle = view.color;
            view.context.fillRect(view.point.x - 5, view.point.y - 5, 10, 10);
          },
          connection(view) {
            calls.connection.add(view.detail);
            const x = (view.geometry.source.x + view.geometry.target.x) / 2;
            const y = (view.geometry.source.y + view.geometry.target.y) / 2;
            view.context.fillStyle = view.color;
            view.context.fillRect(x - 5, y - 5, 10, 10);
          },
          destroy() {
            destroyed++;
          },
        };
      },
    });
    const preset = createPreset(base, {
      theme: { node: "#14dc5a" },
      ports: { style: { color: "#2040e0" } },
      connections: { style: { color: "#dc326e" } },
    });
    const { editor: first } = network({ preset });
    const { editor: second } = network({ preset });
    first.render();
    second.render();
    const pixel = (editor: typeof first, x: number, y: number) => {
      const ctx = editor.canvas.getContext("2d")!, ratio = ctx.getTransform().a;
      return [
        ...ctx.getImageData(Math.round(x * ratio), Math.round(y * ratio), 1, 1)
          .data,
      ];
    };
    const source = first.getPortPosition("a", "out")!,
      target = first.getPortPosition("b", "in")!;
    const pixels = {
      first: pixel(first, 10, 10),
      second: pixel(second, 10, 10),
      node: pixel(first, 50, 80),
      port: pixel(first, source.x, source.y),
      connection: pixel(
        first,
        (source.x + target.x) / 2,
        (source.y + target.y) / 2,
      ),
    };
    for (const scale of [0.3, 0.1]) {
      first.setViewport({ scale });
      first.render();
    }
    first.destroy();
    first.destroy();
    second.destroy();
    return {
      pixels,
      created,
      destroyed,
      calls: Object.fromEntries(
        Object.entries(calls).map(([key, value]) => [key, [...value]]),
      ),
    };
  });
  expect(result.pixels).toEqual({
    first: [0, 0, 0, 255],
    second: [255, 255, 255, 255],
    node: [20, 220, 90, 255],
    port: [32, 64, 224, 255],
    connection: [220, 50, 110, 255],
  });
  expect(result.created).toBe(2);
  expect(result.destroyed).toBe(2);
  for (const calls of Object.values(result.calls)) {
    expect(calls).toEqual(["full", "compact", "overview"]);
  }
});

test("missing preset fails before changing the host", async ({ page }) => {
  const result = await page.evaluate(() => {
    const { Editor, GraphDocument, NodeRegistry } = globalThis.nodeflowTest;
    const host = document.createElement("div");
    let error = "";
    try {
      // @ts-expect-error Exercise a JavaScript caller that omitted the required preset.
      new Editor(host, { document: new GraphDocument(new NodeRegistry()) });
    } catch (e) {
      error = String(e);
    }
    return {
      error,
      children: host.children.length,
      style: host.getAttribute("style"),
    };
  });
  expect(result.error).toContain("explicit preset");
  expect(result.children).toBe(0);
  expect(result.style).toBeNull();
});
