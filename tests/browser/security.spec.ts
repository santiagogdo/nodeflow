import { expect, test } from "npm:@playwright/test@1.63.0";
import type {} from "./fixture.ts";
import type { GraphCommand } from "../../src/core/index.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => !!globalThis.nodeflowTest);
});

test("imported labels render with bounded measurement work and preserve ordinary ellipses", async ({ page }) => {
  const results = await page.evaluate(() => {
    const { editor, graph } = globalThis.nodeflowTest.fixture({
      touch: false,
      nodes: { motion: false, theme: { font: "monospace" } },
      nodeAppearance: () => ({
        draw: (_view, defaults) => defaults(["header"]),
      }),
    });
    const ctx = editor.canvas.getContext("2d")!;
    const measure = ctx.measureText.bind(ctx), fill = ctx.fillText.bind(ctx);
    const results = [];
    try {
      for (
        const label of [
          "",
          "Short",
          "W".repeat(100_000),
          "W".repeat(80),
          "😀".repeat(50_000),
        ]
      ) {
        const imported = JSON.parse(graph.serialize());
        imported.graphs.root.nodes.a.label = label;
        graph.load(JSON.stringify(imported));
        let calls = 0, characters = 0, titleX = 0, titleFont = "";
        const drawn: string[] = [];
        ctx.measureText = (text) => {
          calls++;
          characters += text.length;
          // Stop the vulnerable baseline before it blocks the browser.
          if (calls > 64) throw new Error("Unbounded text measurement");
          return measure(text);
        };
        ctx.fillText = (text, x, y, maxWidth) => {
          drawn.push(text);
          titleX = x;
          titleFont = ctx.font;
          fill(text, x, y, maxWidth);
        };
        editor.render();
        const rendered = drawn[0];
        const b = editor.getNodeBounds("a")!;
        editor.render();
        const width = b.x + b.width - 34 - titleX;
        // A small ordinary label is the control for the previous output behavior.
        ctx.save();
        ctx.font = titleFont;
        let expected = label;
        if (label.length < 100 && measure(label).width > width) {
          while (expected.length && measure(`${expected}…`).width > width) {
            expected = expected.slice(0, -1);
          }
          expected += "…";
        }
        results.push({
          labelLength: label.length,
          rendered,
          expected: label.length < 100 ? expected : null,
          calls,
          characters,
          fits: measure(rendered).width <= width,
          wellFormed: !/[\uD800-\uDBFF]…$/.test(rendered),
        });
        ctx.restore();
        ctx.measureText = measure;
        ctx.fillText = fill;
      }
    } finally {
      ctx.measureText = measure;
      ctx.fillText = fill;
      editor.destroy();
    }
    return results;
  });
  for (const result of results) {
    expect(result.calls).toBeLessThanOrEqual(64);
    expect(result.characters).toBeLessThan(4 * result.labelLength + 2000);
    expect(result.fits).toBe(true);
    expect(result.wellFormed).toBe(true);
    if (result.expected !== null) expect(result.rendered).toBe(result.expected);
    else expect(result.rendered.endsWith("…")).toBe(true);
  }
});

test("loading and pasting extreme coordinates keeps the editor responsive", async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, graph } = globalThis.nodeflowTest.fixture({ touch: false });
    try {
      const imported = JSON.parse(graph.serialize());
      imported.graphs.root.nodes.a.position = { x: 1e30, y: -1e30 };
      graph.load(JSON.stringify(imported));
      editor.render();
      const pasted = graph.paste(graph.copy(["a"]));
      editor.render();
      return {
        position: graph.snapshot().graphs.root.nodes.a.position,
        pasted: pasted.length,
      };
    } finally {
      editor.destroy();
    }
  });
  expect(result).toEqual({ position: { x: 1e30, y: -1e30 }, pasted: 1 });
});

test("JSON command selectors cannot mutate browser Object.prototype", async ({ page }) => {
  const results = await page.evaluate(() => {
    const { GraphDocument, NodeRegistry } = globalThis.nodeflowTest;
    const commands: GraphCommand[] = [
      { type: "rename-graph", graphId: "__proto__", label: "polluted" },
      { type: "set-interface", graphId: "__proto__", inputs: [], outputs: [] },
      {
        type: "move-nodes",
        positions: JSON.parse('{"__proto__":{"x":1,"y":2}}'),
      },
      {
        type: "update-group",
        groupId: "__proto__",
        changes: { parentId: "missing" },
      },
    ];
    return commands.map((command) => {
      const graph = new GraphDocument(new NodeRegistry());
      const before = graph.serialize();
      const descriptors = Object.getOwnPropertyDescriptors(Object.prototype);
      let unchanged = false, rejected = false;
      try {
        graph.dispatch(JSON.parse(JSON.stringify(command)));
      } catch {
        rejected = true;
      } finally {
        unchanged =
          JSON.stringify(Object.getOwnPropertyDescriptors(Object.prototype)) ===
            JSON.stringify(descriptors);
        for (const key of Reflect.ownKeys(Object.prototype)) {
          if (!Object.hasOwn(descriptors, key)) {
            Reflect.deleteProperty(Object.prototype, key);
          }
        }
        Object.defineProperties(Object.prototype, descriptors);
      }
      return {
        type: command.type,
        unchanged,
        rejected,
        atomic: graph.serialize() === before && graph.revision === 0,
      };
    });
  });
  for (const result of results) {
    expect(result, result.type).toMatchObject({
      unchanged: true,
      rejected: true,
      atomic: true,
    });
  }
});
