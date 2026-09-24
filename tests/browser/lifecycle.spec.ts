import { expect, test } from "npm:@playwright/test@1.63.0";
import type {} from "./fixture.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => !!globalThis.nodeflowTest);
});

test("coalesces invalidation, stays idle, and disposes subscriptions and helpers", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { editor, graph, host } = globalThis.nodeflowTest.fixture();
    // Let the browser deliver the initial ResizeObserver notification.
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    const initial = editor.metrics.frames;
    editor.setViewport({ x: 4 });
    editor.setViewport({ y: 5 });
    await new Promise(requestAnimationFrame);
    const frames = editor.metrics.frames;
    await new Promise((resolve) => setTimeout(resolve, 100));
    const idleFrames = editor.metrics.frames;
    let events = 0;
    editor.on(() => events++);
    editor.destroy();
    editor.destroy();
    graph.addNode({ type: "value" });
    globalThis.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    let error = "";
    try {
      editor.addNode("value");
    } catch (e) {
      error = String(e);
    }
    return {
      delta: frames - initial,
      frames,
      idleFrames,
      finalFrames: editor.metrics.frames,
      children: host.children.length,
      events,
      error,
    };
  });
  expect(result.delta).toBe(1);
  expect(result.idleFrames).toBe(result.frames);
  expect(result.finalFrames).toBe(result.frames);
  expect(result.children).toBe(0);
  expect(result.events).toBe(0);
  expect(result.error).toContain("destroyed");
});

test("invalid extensions leave their container unchanged", async ({ page }) => {
  const result = await page.evaluate(() => {
    const { Editor, GraphDocument, NodeRegistry } = globalThis.nodeflowTest;
    const host = document.createElement("div");
    let error = "";
    try {
      new Editor(host, {
        preset: globalThis.nodeflowTest.defaultPreset,
        document: new GraphDocument(new NodeRegistry()),
        extensions: [{
          controls: [{ kind: "x", height: 40, draw() {} }, {
            kind: "x",
            height: 40,
            draw() {},
          }],
        }],
      });
    } catch (e) {
      error = String(e);
    }
    return {
      error,
      children: host.children.length,
      position: host.style.position,
    };
  });
  expect(result.error).toContain("Duplicate");
  expect(result.children).toBe(0);
  expect(result.position).toBe("");
});

test("world and screen coordinates are inverse and fit measured content", async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor } = globalThis.nodeflowTest.fixture();
    editor.setViewport({ x: -40, y: 77, scale: 1.75 });
    const world = editor.toWorld(editor.toScreen({ x: 10, y: -30 }));
    editor.fitView();
    const origin = editor.toScreen(editor.getNodeBounds("a")!);
    let rejected = false;
    try {
      editor.setViewport({ scale: NaN });
    } catch {
      rejected = true;
    }
    editor.destroy();
    return { world, origin, rejected };
  });
  expect(result.world).toEqual({ x: 10, y: -30 });
  expect(result.origin.x).toBeGreaterThan(0);
  expect(result.origin.y).toBeGreaterThan(0);
  expect(result.rejected).toBe(true);
});

test("invalid text survives selection changes and composition defers commits", async ({ page }) => {
  const result = await page.evaluate(() => {
    const host = document.createElement("div");
    document.body.append(host);
    let commits = 0;
    const bridge = new globalThis.nodeflowTest.TextInputBridge(host, () => {});
    bridge.open({ nodeId: "a", controlId: "x", value: "", start: 0, end: 0 }, {
      x: 0,
      y: 0,
      width: 150,
      height: 32,
    }, {
      multiline: false,
      numeric: false,
      label: "Text",
      font: "sans-serif",
      fontSize: 13,
      lineHeight: 18,
      scale: 1,
      commit(value) {
        commits++;
        return value ? undefined : "Required";
      },
      cancel() {},
      done() {},
    });
    const input = host.querySelector("input")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    document.dispatchEvent(new Event("selectionchange"));
    const invalid = input.getAttribute("aria-invalid");
    commits = 0;
    input.dispatchEvent(new CompositionEvent("compositionstart"));
    input.value = "日本語";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    const composingCommits = commits;
    input.dispatchEvent(new CompositionEvent("compositionend"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    return {
      invalid,
      composingCommits,
      commits,
      children: host.children.length,
    };
  });
  expect(result).toEqual({
    invalid: "true",
    composingCommits: 0,
    commits: 1,
    children: 0,
  });
});
