import { expect, test } from "npm:@playwright/test@1.63.0";
import type {} from "./fixture.ts";
import type { NodeDrawContext } from "../../src/index.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => !!globalThis.nodeflowTest);
});

test("glass refracts underlying nodes only around its rim and can be disabled", async ({ page }) => {
  const result = await page.evaluate(() => {
    const style = {
      opacity: 0,
      blur: 0,
      refraction: 12,
      refractionWidth: 20,
      highlightOpacity: 0,
      tintOpacity: 0,
      lightOpacity: 0,
      borderWidth: 0,
      selectionWidth: 0,
      shadowBlur: 0,
    };
    const { editor, graph } = globalThis.nodeflowTest.fixture({
      touch: false,
      viewport: { x: 30, y: 30, scale: 1 },
      nodes: { style, motion: false },
      nodeAppearance: (node) => ({
        draw(view, defaults) {
          if (node.id !== "a") return defaults(["surface"]);
          const { context: ctx, geometry: { bounds: b } } = view;
          // A colored backdrop makes displacement and stacking observable.
          for (let x = 0; x < b.width; x += 4) {
            ctx.fillStyle = x % 8 === 0 ? "#f02040" : "#2080f0";
            ctx.fillRect(b.x + x, b.y, 4, b.height);
          }
        },
      }),
    });
    graph.addNode({ id: "z", type: "value", position: { x: 0, y: 0 } });
    const pixels = (offset: number) => {
      editor.render();
      const b = editor.getNodeBounds("z")!,
        p = editor.toScreen({ x: b.x + offset, y: b.y + b.height / 2 });
      const dpr = editor.canvas.width /
        editor.canvas.getBoundingClientRect().width;
      return [
        ...editor.canvas.getContext("2d")!.getImageData(
          Math.round(p.x * dpr),
          Math.round(p.y * dpr),
          Math.round(16 * dpr),
          1,
        ).data,
      ];
    };
    const bent = pixels(2), center = pixels(70);
    editor.setNodeAppearance({
      style: { ...style, refraction: 0 },
      motion: false,
    });
    const clear = pixels(2), clearCenter = pixels(70);
    // Sampling also remains aligned with a panned, scaled, partially clipped node.
    editor.setViewport({ x: -20, y: 45, scale: 1.25 });
    const pannedClear = pixels(70);
    editor.setNodeAppearance({ style, motion: false });
    const pannedGlass = pixels(70);
    editor.destroy();
    return { bent, clear, center, clearCenter, pannedClear, pannedGlass };
  });
  expect(result.bent).not.toEqual(result.clear);
  expect(result.center).toEqual(result.clearCenter);
  expect(result.center.some((value) => value > 200)).toBe(true);
  expect(result.pannedGlass).toEqual(result.pannedClear);
});

test("full node painter replaces pixels at every zoom and composes public appearance layers", async ({ page }) => {
  const result = await page.evaluate(() => {
    let view: NodeDrawContext | undefined;
    const details: string[] = [];
    const { editor } = globalThis.nodeflowTest.fixture({
      touch: false,
      viewport: { x: 30, y: 30 },
      nodes: { style: { radius: 25, padding: 22 }, theme: { text: "red" } },
      extensions: [{
        presentations: [{
          type: "value",
          appearance: { style: { radius: 3 }, theme: { text: "blue" } },
        }],
      }],
      nodeAppearance: () => ({
        theme: { text: "rgb(20, 200, 90)" },
        draw(context) {
          view = context;
          details.push(context.detail);
          context.context.fillStyle = context.theme.text;
          const b = context.geometry.bounds;
          context.context.fillRect(b.x, b.y, b.width, b.height);
        },
      }),
    });
    editor.render();
    const dpr = editor.canvas.width /
      editor.canvas.getBoundingClientRect().width;
    const pixel = [
      ...editor.canvas.getContext("2d")!.getImageData(40 * dpr, 40 * dpr, 1, 1)
        .data,
    ];
    const tokens = {
      radius: view!.style.radius,
      padding: view!.style.padding,
      text: view!.theme.text,
    };
    editor.setViewport({ scale: 0.3 });
    editor.render();
    editor.setViewport({ scale: 0.1 });
    editor.render();
    editor.destroy();
    return { pixel, tokens, details };
  });
  expect(result.pixel).toEqual([20, 200, 90, 255]);
  expect(result.tokens).toEqual({
    radius: 3,
    padding: 22,
    text: "rgb(20, 200, 90)",
  });
  expect(result.details).toEqual(["full", "compact", "overview"]);
});

test("custom geometry and typography keep pointer editing and native input aligned", async ({ page }) => {
  const bounds = await page.evaluate(() => {
    const { editor } = globalThis.nodeflowTest.fixture({
      touch: false,
      viewport: { x: 30, y: 20 },
      nodes: {
        style: {
          headerHeight: 70,
          padding: 24,
          fontSize: 18,
          lineHeight: 26,
          controlHeight: 42,
          inputPadding: 18,
        },
        theme: { font: "monospace" },
        layout: (g) => ({
          ...g,
          controls: g.controls.map((c) => ({
            ...c,
            row: { ...c.row, x: c.row.x + 12, width: c.row.width - 12 },
            bounds: {
              ...c.bounds,
              x: c.bounds.x + 12,
              width: c.bounds.width - 12,
            },
          })),
        }),
      },
    });
    editor.render();
    const b = editor.getControlBounds("a", "value")!,
      p = editor.toScreen(b),
      canvas = editor.canvas.getBoundingClientRect();
    return {
      x: p.x + canvas.x,
      y: p.y + canvas.y,
      width: b.width,
      height: b.height,
    };
  });
  await page.mouse.click(bounds.x + 25, bounds.y + bounds.height / 2);
  const input = page.getByRole("textbox", {
    name: "Value: Value",
    exact: true,
  });
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS("font-size", "18px");
  await expect(input).toHaveCSS("font-family", "monospace");
  await expect(input).toHaveCSS("padding-left", "18px");
  const native = await input.boundingBox();
  expect(native!.x).toBeCloseTo(bounds.x);
  expect(native!.width).toBeCloseTo(bounds.width);
  await input.fill("42");
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Value: Value", exact: true }))
    .toHaveText("Value: 42");
});

test("motion settles, running pauses offscreen, reduced motion updates live, destroy stops frames", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const result = await page.evaluate(async () => {
    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const progress: number[] = [];
    const { editor } = globalThis.nodeflowTest.fixture({
      nodes: {
        motion: { duration: 100 },
        draw(view, defaults) {
          progress.push(view.progress.selection);
          defaults();
        },
      },
    });
    await wait(70);
    editor.setSelection({ nodes: ["a"] });
    await wait(260);
    const settled = editor.metrics.frames;
    await wait(80);
    const idle = editor.metrics.frames;
    editor.setRuntimeState({
      a: { path: ["a"], status: "running", outputs: {} },
    });
    await wait(90);
    const running = editor.metrics.frames;
    editor.setViewport({ x: -10000 });
    await wait(60);
    const offscreen = editor.metrics.frames;
    await wait(80);
    const offscreenIdle = editor.metrics.frames;
    editor.setViewport({ x: 0 });
    await wait(60);
    const resumed = editor.metrics.frames;
    editor.setNodeAppearance({ motion: false });
    await wait(60);
    const disabled = editor.metrics.frames;
    await wait(80);
    const disabledIdle = editor.metrics.frames;
    editor.setNodeAppearance({});
    editor.destroy();
    const destroyed = editor.metrics.frames;
    await wait(60);
    return {
      progress,
      settled,
      idle,
      running,
      offscreen,
      offscreenIdle,
      resumed,
      disabled,
      disabledIdle,
      destroyed,
      final: editor.metrics.frames,
    };
  });
  expect(result.progress.some((value) => value > 0 && value < 1)).toBe(true);
  expect(result.progress).toContain(1);
  expect(result.idle).toBe(result.settled);
  expect(result.running).toBeGreaterThan(result.idle + 1);
  expect(result.offscreenIdle).toBe(result.offscreen);
  expect(result.resumed).toBeGreaterThan(result.offscreenIdle + 1);
  expect(result.disabledIdle).toBe(result.disabled);
  expect(result.final).toBe(result.destroyed);
});

test("system reduced motion changes active execution to a static indicator", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // A render hook exposes frame counts in the DOM without reaching into editor internals.
  await page.evaluate(() => {
    const { editor, host } = globalThis.nodeflowTest.fixture({
      nodes: {
        draw(view, defaults) {
          document.body.dataset.frames = String(
            Number(document.body.dataset.frames ?? 0) + 1,
          );
          document.body.dataset.selection = String(view.progress.selection);
          defaults();
        },
      },
    });
    host.dataset.test = "motion";
    editor.setRuntimeState({
      a: { path: ["a"], status: "running", outputs: {} },
    });
    editor.setSelection({ nodes: ["a"] });
  });
  await expect.poll(() => page.locator("body").getAttribute("data-frames")).not
    .toBeNull();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  const frames = await page.locator("body").getAttribute("data-frames");
  await page.waitForTimeout(100);
  expect(await page.locator("body").getAttribute("data-frames")).toBe(frames);
  expect(await page.locator("body").getAttribute("data-selection")).toBe("1");
});

test("partial painters retain controls and isolate custom icon and field drawing", async ({ page }) => {
  const result = await page.evaluate(() => {
    let iconCalls = 0, fieldCalls = 0;
    const { editor } = globalThis.nodeflowTest.fixture({
      touch: false,
      viewport: { x: 30, y: 30 },
      nodes: {
        draw(view, drawDefault) {
          const b = view.geometry.bounds;
          view.context.fillStyle = "#123456";
          view.context.fillRect(b.x, b.y, b.width, b.height);
          drawDefault(["header", "body", "ports"]);
        },
      },
      extensions: [{
        presentations: [{
          type: "value",
          drawIcon(ctx, bounds) {
            iconCalls++;
            ctx.translate(bounds.x, bounds.y);
            ctx.fillStyle = "red";
            ctx.fillRect(0, 0, bounds.width, bounds.height);
          },
          controls: [{
            id: "value",
            kind: "number",
            label: "Value",
            draw(ctx, b) {
              fieldCalls++;
              ctx.fillStyle = "rgb(40, 150, 220)";
              ctx.fillRect(b.x, b.y, b.width, b.height);
            },
          }],
        }],
      }],
    });
    editor.render();
    const b = editor.getControlBounds("a", "value")!, p = editor.toScreen(b);
    const dpr = editor.canvas.width /
      editor.canvas.getBoundingClientRect().width;
    const pixel = [
      ...editor.canvas.getContext("2d")!.getImageData(
        (p.x + 5) * dpr,
        (p.y + 5) * dpr,
        1,
        1,
      ).data,
    ];
    editor.destroy();
    return { iconCalls, fieldCalls, pixel };
  });
  expect(result).toEqual({
    iconCalls: 1,
    fieldCalls: 1,
    pixel: [40, 150, 220, 255],
  });
});

test("invalid appearance leaves the host untouched", async ({ page }) => {
  const result = await page.evaluate(() => {
    const { Editor, GraphDocument, NodeRegistry } = globalThis.nodeflowTest;
    const host = document.createElement("div");
    const doc = new GraphDocument(
      new NodeRegistry().register({ type: "x", title: "X", ports: [] }),
    );
    doc.addNode({ type: "x" });
    let message = "";
    try {
      new Editor(host, {
        preset: globalThis.nodeflowTest.defaultPreset,
        document: doc,
        nodes: { style: { radius: -1 } },
      });
    } catch (error) {
      message = String(error);
    }
    return {
      message,
      children: host.children.length,
      style: host.style.cssText,
    };
  });
  expect(result.message).toContain("non-negative");
  expect(result.children).toBe(0);
  expect(result.style).toBe("");
});

test("custom field and full-node painters receive uncommitted text and validation state", async ({ page }) => {
  await page.evaluate(() => {
    const { editor } = globalThis.nodeflowTest.fixture({
      viewport: { x: 30, y: 30 },
      nodes: {
        draw(view, defaults) {
          document.body.dataset.nodeValue = String(
            view.getControlState("value")?.value,
          );
          defaults();
        },
      },
      extensions: [{
        presentations: [{
          type: "value",
          controls: [{
            id: "value",
            kind: "number",
            label: "Value",
            draw(ctx, b, value, theme, state) {
              document.body.dataset.fieldValue = String(value);
              document.body.dataset.fieldError = state?.editing?.error ?? "";
              document.body.dataset.fieldSelection =
                `${state?.editing?.start}:${state?.editing?.end}`;
              ctx.fillStyle = theme.input;
              ctx.fillRect(b.x, b.y, b.width, b.height);
              ctx.fillStyle = theme.text;
              ctx.fillText(String(value), b.x + 10, b.y + b.height / 2);
            },
          }],
        }],
      }],
    });
    editor.setSelection({ nodes: ["a"] });
  });
  await page.getByRole("button", { name: "Value: Value", exact: true }).press(
    "Enter",
  );
  const input = page.getByRole("textbox", {
    name: "Value: Value",
    exact: true,
  });
  await input.fill("17");
  await expect(page.locator("body")).toHaveAttribute("data-node-value", "17");
  await expect(page.locator("body")).toHaveAttribute("data-field-value", "17");
  await expect(page.locator("body")).toHaveAttribute(
    "data-field-selection",
    "2:2",
  );
  await input.fill("invalid");
  await input.press("Enter");
  await expect(page.locator("body")).toHaveAttribute(
    "data-field-error",
    "Enter a finite number",
  );
  await expect(input).toBeFocused();
  await input.press("Escape");
  await expect(page.locator("body")).toHaveAttribute("data-node-value", "1");
});
