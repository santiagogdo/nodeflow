import { expect, test } from "npm:@playwright/test@1.63.0";
import type { Page } from "npm:@playwright/test@1.63.0";
import { Buffer } from "node:buffer";
import type { Editor, GraphDocument } from "../../src/index.ts";
import type { RunResult } from "../../src/runtime/index.ts";
import type { ExampleId } from "../../examples/workbench/fixtures.ts";
declare global {
  var nodeflowDemo: Window["nodeflowDemo"];
  interface Window {
    nodeflowDemo: {
      editor: Editor;
      document: GraphDocument;
      result: RunResult | null;
      loadExample(id: ExampleId, reset?: boolean): void;
      runGraph(): Promise<void>;
      arrange(): Promise<void>;
      measureRendering(): Promise<void>;
    };
  }
}
async function point(page: Page, id: string, x: number, y: number) {
  return page.evaluate(
    ({ id, x, y }) => {
      const editor = globalThis.nodeflowDemo.editor,
        bounds = editor.getNodeBounds(id)!;
      const p = editor.toScreen({ x: bounds.x + x, y: bounds.y + y }),
        canvas = editor.canvas.getBoundingClientRect();
      return { x: p.x + canvas.x, y: p.y + canvas.y };
    },
    { id, x, y },
  );
}
async function portPoint(page: Page, nodeId: string, portId: string) {
  return page.evaluate(({ nodeId, portId }) => {
    const editor = globalThis.nodeflowDemo.editor;
    const p = editor.toScreen(editor.getPortPosition(nodeId, portId)!);
    const canvas = editor.canvas.getBoundingClientRect();
    return { x: p.x + canvas.x, y: p.y + canvas.y };
  }, { nodeId, portId });
}
async function clickPoint(
  page: Page,
  id: string,
  x: number,
  y: number,
  touch = false,
) {
  const p = await point(page, id, x, y);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
async function open(page: Page, example = "pipeline") {
  await page.goto(`/examples/workbench/?example=${example}`);
  await page.waitForFunction(
    () => !!globalThis.nodeflowDemo?.editor.metrics.frames,
  );
}
async function serialized(page: Page) {
  return page.evaluate(() => globalThis.nodeflowDemo.document.serialize());
}

test("pipeline: canvas field, run results, undo, and persisted reload", async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await expect(page.locator("#run-status")).toHaveText("Completed");
  await expect(page).toHaveTitle("Nodeflow — Order processing");
  await expect(page.locator(".data-table tbody tr")).toHaveCount(3);
  await clickPoint(page, "filter", 130, isMobile ? 247 : 218, isMobile);
  const field = page.getByRole("textbox", {
    name: "Filter orders: Minimum",
    exact: true,
  });
  await expect(field).toBeFocused();
  await field.fill("200");
  await field.press("Enter");
  expect(
    await page.evaluate(
      () =>
        globalThis.nodeflowDemo.document.snapshot().graphs.root.nodes.filter
          .data
          .minimum,
    ),
  ).toBe(200);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".data-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".data-table")).toContainText("Luis");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        globalThis.nodeflowDemo.document.snapshot().graphs.root.nodes.filter
          .data
          .minimum,
    ),
  ).toBe(100);
  await page.waitForFunction(() =>
    localStorage
      .getItem("nodeflow:v2:workbench:pipeline")
      ?.includes('"minimum": 100')
  );
  await page.reload();
  await expect(page.locator(".data-table tbody tr")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("drag commits once; pointer cancellation leaves the document unchanged", async ({ page, isMobile }) => {
  await open(page);
  await page.evaluate(() => globalThis.nodeflowDemo.editor.focusNode("filter"));
  const before = await serialized(page),
    revision = await page.evaluate(() =>
      globalThis.nodeflowDemo.document.revision
    ),
    p = await point(page, "filter", 95, 22);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 44, p.y + 22, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => globalThis.nodeflowDemo.document.revision))
    .toBe(
      revision + 1,
    );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await serialized(page)).toBe(before);
  const after = await point(page, "filter", 95, 22);
  await page.mouse.move(after.x, after.y);
  await page.mouse.down();
  await page.mouse.move(after.x + 60, after.y + 20);
  await page
    .locator("canvas")
    .dispatchEvent("pointercancel", {
      pointerId: 1,
      pointerType: isMobile ? "touch" : "mouse",
    });
  await page.mouse.up();
  expect(await serialized(page)).toBe(before);
});

test("worker layout is one undoable transaction and nested graph navigation works", async ({ page, isMobile }) => {
  await open(page);
  const before = await serialized(page);
  await page.locator("#layout").click();
  await expect(page.locator("#layout")).toContainText("Auto layout");
  await expect.poll(() => serialized(page)).not.toBe(before);
  await page.locator("#undo").click();
  expect(await serialized(page)).toBe(before);
  if (isMobile) {
    await page.evaluate(() =>
      globalThis.nodeflowDemo.editor.focusNode("transform")
    );
  }
  await clickPoint(page, "transform", 124, isMobile ? 145 : 140, isMobile);
  await expect(page.locator("#graph-title")).toHaveValue("Transform group");
  expect(await page.evaluate(() => globalThis.nodeflowDemo.editor.graphId))
    .toBe(
      "transform",
    );
  await page.locator("#back").click();
  await expect(page.locator("#graph-title")).toHaveValue("Order processing");
});

test("create a reusable subgraph, duplicate it, and undo both edits", async ({ page }) => {
  await open(page);
  const before = await serialized(page);
  await page.evaluate(() => {
    const { editor } = globalThis.nodeflowDemo;
    editor.setSelection({ nodes: ["filter", "table"] });
    editor.createSubgraph();
    editor.duplicateSelection();
  });
  expect(
    await page.evaluate(
      () =>
        Object.values(
          globalThis.nodeflowDemo.document.snapshot().graphs.root.nodes,
        ).filter((node) => node.type === "@subgraph").length,
    ),
  ).toBe(3);
  await page.evaluate(() => {
    globalThis.nodeflowDemo.document.undo();
    globalThis.nodeflowDemo.document.undo();
  });
  expect(await serialized(page)).toBe(before);
});

test("gallery: composition, validation, select, slider keyboard and custom control", async ({ page, isMobile }) => {
  await open(page, "controls");
  await page.evaluate(() =>
    globalThis.nodeflowDemo.editor.focusNode("gallery")
  );
  await clickPoint(page, "gallery", 150, isMobile ? 107 : 98, isMobile);
  const field = page.getByRole("textbox", {
    name: "Control gallery: Text",
    exact: true,
  });
  await field.fill("");
  await field.press("Enter");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await field.dispatchEvent("compositionstart");
  await field.fill("日本語");
  await field.press("Enter");
  expect(
    await page.evaluate(
      () =>
        globalThis.nodeflowDemo.document.snapshot().graphs.root.nodes.gallery
          .data
          .title,
    ),
  ).toBe("Hello, canvas");
  await field.dispatchEvent("compositionend");
  await field.press("Enter");
  expect(
    await page.evaluate(
      () =>
        globalThis.nodeflowDemo.document.snapshot().graphs.root.nodes.gallery
          .data
          .title,
    ),
  ).toBe("日本語");
  await page
    .getByRole("button", { name: "Control gallery: Mode", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(
      () =>
        globalThis.nodeflowDemo.document.snapshot().graphs.root.nodes.gallery
          .data
          .mode,
    ),
  ).toBe("fast");
  await page
    .getByRole("button", { name: "Control gallery: Gain", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  expect(
    await page.evaluate(
      () =>
        globalThis.nodeflowDemo.document.snapshot().graphs.root.nodes.gallery
          .data
          .gain,
    ),
  ).toBe(66);
  await page
    .getByRole("button", {
      name: "Control gallery: Custom rating",
      exact: true,
    })
    .focus();
  await page.keyboard.press("ArrowRight");
  expect(
    await page.evaluate(
      () =>
        globalThis.nodeflowDemo.document.snapshot().graphs.root.nodes.gallery
          .data
          .rating,
    ),
  ).toBe(5);
});

test("all examples load without errors and async branching produces a log", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, "automation");
  await page.locator("#run").click();
  await expect(page.locator("#run-status")).toHaveText("Completed");
  await expect(page.locator("#output-content")).toContainText("Order approved");
  const skipped = await page.evaluate(
    () => globalThis.nodeflowDemo.result!.nodes['["rejected"]'].status,
  );
  expect(skipped).toBe("skipped");
  for (
    const id of [
      "diagrams",
      "programming",
      "controls",
      "benchmark",
    ] as const
  ) {
    await page.evaluate((id) => globalThis.nodeflowDemo.loadExample(id), id);
    await expect(page.locator("canvas")).toBeVisible();
    await page.waitForFunction(
      () => globalThis.nodeflowDemo.editor.metrics.frames > 0,
    );
  }
  expect(
    await page.evaluate(() => globalThis.nodeflowDemo.editor.metrics.nodeCount),
  ).toBe(1000);
  expect(errors).toEqual([]);
});

test(
  "JSON export roundtrips; import clears errors and rejects malformed files atomically",
  async ({
    page,
    isMobile,
  }, testInfo) => {
    await open(page, "programming");
    const original = await serialized(page);
    if (isMobile) {
      await page.getByRole("button", { name: "View", exact: true }).click();
    }
    const downloading = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: isMobile ? "Export JSON" : "Export",
        exact: true,
      })
      .click();
    const download = await downloading,
      path = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(path);
    expect(JSON.parse(await Deno.readTextFile(path))).toEqual(
      JSON.parse(original),
    );

    await open(page, "diagrams");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.locator("#run-status")).toHaveText("Could not run");
    const beforeInvalidImport = await serialized(page);
    await page.locator("#file-input").setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from("{invalid-json"),
    });
    await expect(page.locator("#problem-count")).toHaveText("2");
    expect(await serialized(page)).toBe(beforeInvalidImport);

    await page.locator("#file-input").setInputFiles(path);
    await expect(page.locator("#graph-title")).toHaveValue(
      "A little arithmetic",
    );
    await expect(page.locator("#run-status")).toHaveText("Ready to run");
    await expect(page.locator("#problem-count")).toBeEmpty();
    expect(JSON.parse(await serialized(page))).toEqual(JSON.parse(original));
    await page.getByRole("tab", { name: "Run log", exact: true }).click();
    await expect(page.locator("#output-content")).not.toContainText("running");
  },
);

test("import cancels an active run without repopulating old results or errors", async ({ page }) => {
  await open(page, "automation");
  const original = await serialized(page);
  await page.evaluate(() =>
    globalThis.nodeflowDemo.document.dispatch({
      type: "update-node",
      nodeId: "delay",
      changes: { data: { milliseconds: 5000 } },
    })
  );
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator("#run-status")).toHaveText("Running…");
  await page.locator("#file-input").setInputFiles({
    name: "replacement.json",
    mimeType: "application/json",
    buffer: Buffer.from(original),
  });
  await expect(page.locator("#run-status")).toHaveText("Ready to run");
  await expect(page.locator("#problem-count")).toBeEmpty();
  expect(await page.evaluate(() => globalThis.nodeflowDemo.result)).toBeNull();
  await page.getByRole("tab", { name: "Run log", exact: true }).click();
  await expect(page.locator("#output-content")).not.toContainText("cancelled");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator("#run-status")).toHaveText("Completed");
  await page.getByRole("tab", { name: "Output", exact: true }).click();
  await expect(page.locator("#output-content")).toContainText("Order approved");
});

test("mobile panels, touch pan, and pinch preserve the graph", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch viewport only");
  await open(page);
  const before = await serialized(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Nodes", exact: true }).click();
  await expect(page.locator("#library")).toBeVisible();
  await page.getByRole("button", { name: "Close node library" }).click();
  await expect(page.locator("#library")).not.toBeVisible();
  const viewport = await page.evaluate(() =>
    globalThis.nodeflowDemo.editor.getViewport()
  );
  const canvas = page.locator("canvas");
  await canvas.dispatchEvent("pointerdown", {
    pointerId: 10,
    pointerType: "touch",
    clientX: 30,
    clientY: 145,
    button: 0,
  });
  await canvas.dispatchEvent("pointerdown", {
    pointerId: 11,
    pointerType: "touch",
    clientX: 300,
    clientY: 145,
    button: 0,
  });
  await canvas.dispatchEvent("pointermove", {
    pointerId: 11,
    pointerType: "touch",
    clientX: 360,
    clientY: 160,
  });
  await canvas.dispatchEvent("pointerup", {
    pointerId: 11,
    pointerType: "touch",
    clientX: 360,
    clientY: 160,
  });
  await canvas.dispatchEvent("pointerup", {
    pointerId: 10,
    pointerType: "touch",
    clientX: 30,
    clientY: 145,
  });
  expect(
    await page.evaluate(() =>
      globalThis.nodeflowDemo.editor.getViewport().scale
    ),
  ).toBeGreaterThan(viewport.scale);
  expect(await serialized(page)).toBe(before);
});

test("connect, reconnect, cancel, and paste a graph fragment", async ({ page, isMobile }) => {
  test.skip(
    isMobile,
    "Desktop pointer and clipboard path; touch connections use the same endpoint validation",
  );
  await open(page, "programming");
  await page.evaluate(() => {
    const { document, editor } = globalThis.nodeflowDemo;
    document.load({
      version: 2,
      rootGraphId: "root",
      graphs: {
        root: {
          id: "root",
          label: "Connections",
          nodes: {},
          connections: {},
          groups: {},
          inputs: [],
          outputs: [],
        },
      },
    });
    document.addNode({
      id: "source",
      type: "number",
      position: { x: 0, y: 0 },
    });
    document.addNode({
      id: "first",
      type: "result",
      position: { x: 360, y: 0 },
    });
    document.addNode({
      id: "second",
      type: "result",
      position: { x: 360, y: 220 },
    });
    editor.setViewport({ x: 40, y: 40, scale: 1 });
  });
  let source = await portPoint(page, "source", "value"),
    target = await portPoint(page, "first", "value");
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  expect(
    await page.evaluate(
      () =>
        Object.keys(
          globalThis.nodeflowDemo.document.snapshot().graphs.root.connections,
        ).length,
    ),
  ).toBe(1);
  const second = await portPoint(page, "second", "value");
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(second.x, second.y, { steps: 8 });
  await page.mouse.up();
  expect(
    await page.evaluate(
      () =>
        Object.values(
          globalThis.nodeflowDemo.document.snapshot().graphs.root.connections,
        )[0].target.nodeId,
    ),
  ).toBe("second");
  const before = await serialized(page);
  await page.mouse.click(source.x, source.y);
  await page.keyboard.press("Escape");
  expect(await serialized(page)).toBe(before);
  const copied = await page.evaluate(() => {
    const { editor, document } = globalThis.nodeflowDemo;
    editor.setSelection({ nodes: ["source", "second"] });
    const transfer = new DataTransfer();
    editor.canvas.dispatchEvent(
      new ClipboardEvent("copy", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
    editor.canvas.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
    return {
      format: JSON.parse(transfer.getData("text/plain")).format,
      nodes: Object.keys(document.snapshot().graphs.root.nodes).length,
      connections: Object.keys(document.snapshot().graphs.root.connections)
        .length,
    };
  });
  expect(copied).toEqual({
    format: "nodeflow/fragment",
    nodes: 5,
    connections: 2,
  });
  await page.locator("#undo").click();
  expect(await serialized(page)).toBe(before);
});
