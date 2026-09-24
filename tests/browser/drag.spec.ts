import { expect, test } from "npm:@playwright/test@1.63.0";
import type {} from "./fixture.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => !!globalThis.nodeflowTest);
});

test("capture loss before pointerup finishes a released drag exactly once", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { editor, graph } = globalThis.nodeflowTest.fixture({
      touch: false,
      viewport: { x: 30, y: 30, scale: 0.5 },
    });
    const canvas = editor.canvas, rect = canvas.getBoundingClientRect();
    const start = editor.toScreen({ x: 80, y: 20 });
    const before = graph.serialize(), revision = graph.revision;
    const pointer = (type: string, x: number, y: number, buttons: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: "mouse",
          button: 0,
          buttons,
          clientX: rect.x + start.x + x * 0.5,
          clientY: rect.y + start.y + y * 0.5,
          bubbles: true,
        }),
      );
    pointer("pointerdown", 0, 0, 1);
    pointer("pointermove", 60, 30, 1);
    await new Promise(requestAnimationFrame);
    // Recorded from a real failing drag in the in-app browser: capture is lost
    // with buttons=0, followed by a released move, then pointerup ~12 ms later.
    pointer("lostpointercapture", 70, 35, 0);
    pointer("pointermove", 70, 35, 0);
    pointer("pointerup", 70, 35, 0);
    const position = graph.snapshot().graphs.root.nodes.a.position;
    const changes = graph.revision - revision;
    await new Promise(requestAnimationFrame);
    const settled = graph.snapshot().graphs.root.nodes.a.position;
    graph.undo();
    const restored = graph.serialize() === before;
    editor.destroy();
    return { position, changes, settled, restored };
  });
  expect(result.position).toEqual({ x: 70, y: 35 });
  expect(result.settled).toEqual(result.position);
  expect(result.changes).toBe(1);
  expect(result.restored).toBe(true);
});

test("capture loss cancels a held drag, ignores other pointers, and respects prior cancellation", async ({ page }) => {
  const results = await page.evaluate(() =>
    ["held", "unrelated", "cancel", "blur"].map((mode) => {
      const { editor, graph } = globalThis.nodeflowTest.fixture({
        touch: false,
        viewport: { x: 30, y: 30, scale: 1 },
      });
      const canvas = editor.canvas, rect = canvas.getBoundingClientRect();
      const revision = graph.revision;
      const pointer = (
        type: string,
        x: number,
        buttons: number,
        pointerId = 1,
      ) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId,
            pointerType: "mouse",
            button: 0,
            buttons,
            bubbles: true,
            clientX: rect.x + 110 + x,
            clientY: rect.y + 50,
          }),
        );
      pointer("pointerdown", 0, 1);
      pointer("pointermove", 40, 1);
      if (mode === "cancel") pointer("pointercancel", 40, 0);
      if (mode === "blur") globalThis.dispatchEvent(new Event("blur"));
      pointer(
        "lostpointercapture",
        40,
        mode === "held" ? 1 : 0,
        mode === "unrelated" ? 2 : 1,
      );
      pointer("pointerup", 50, 0);
      const position = graph.snapshot().graphs.root.nodes.a.position;
      const changes = graph.revision - revision;
      editor.destroy();
      return { mode, position, changes };
    })
  );
  for (const { mode, position, changes } of results) {
    expect(position).toEqual({ x: mode === "unrelated" ? 50 : 0, y: 0 });
    expect(changes).toBe(mode === "unrelated" ? 1 : 0);
  }
});

for (
  const input of [
    { deliverMove: true, pointerType: "mouse" },
    { deliverMove: false, pointerType: "mouse" },
    { deliverMove: false, pointerType: "touch" },
    { deliverMove: false, pointerType: "pen" },
  ]
) {
  test(`a quick ${input.pointerType} drop commits the release position (${input.deliverMove ? "stale" : "missing"} move)`, async ({ page }) => {
    const result = await page.evaluate(async ({ deliverMove, pointerType }) => {
      const { editor, graph } = globalThis.nodeflowTest.fixture({
        touch: false,
        viewport: { x: 30, y: 30, scale: 1 },
      });
      const canvas = editor.canvas, rect = canvas.getBoundingClientRect();
      const revision = graph.revision;
      const pointer = (type: string, x: number, y: number, buttons: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType,
            button: 0,
            buttons,
            clientX: rect.x + 110 + x,
            clientY: rect.y + 50 + y,
            bubbles: true,
          }),
        );
      // The entire quick gesture fits between two animation frames.
      pointer("pointerdown", 0, 0, 1);
      if (deliverMove) pointer("pointermove", 2, 1, 1);
      pointer("pointerup", 70, 35, 0);
      const position = { ...graph.snapshot().graphs.root.nodes.a.position };
      const changes = graph.revision - revision;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const settled = { ...graph.snapshot().graphs.root.nodes.a.position };
      graph.undo();
      const undone = graph.snapshot().graphs.root.nodes.a?.position ?? null;
      graph.redo();
      const redone = graph.snapshot().graphs.root.nodes.a?.position ?? null;
      editor.destroy();
      return { position, changes, settled, undone, redone };
    }, input);
    expect(result.position).toEqual({ x: 70, y: 35 });
    expect(result.changes).toBe(1);
    expect(result.settled).toEqual(result.position);
    expect(result.undone).toEqual({ x: 0, y: 0 });
    expect(result.redone).toEqual(result.position);
  });
}

test("opt-in snapping and Alt bypass apply to a quick multi-node drop at zoom", async ({ page }) => {
  const results = await page.evaluate(() =>
    [false, true].map((altKey) => {
      const { editor, graph } = globalThis.nodeflowTest.fixture({
        touch: false,
        snapToGrid: 12,
        viewport: { x: 30, y: 30, scale: 0.5 },
      });
      graph.addNode({ id: "b", type: "value", position: { x: 300, y: 40 } });
      editor.setSelection({ nodes: ["a", "b"] });
      const canvas = editor.canvas, rect = canvas.getBoundingClientRect();
      const start = editor.toScreen({ x: 80, y: 20 });
      const pointer = (type: string, x: number, y: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: "mouse",
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            altKey,
            bubbles: true,
            clientX: rect.x + start.x + x * 0.5,
            clientY: rect.y + start.y + y * 0.5,
          }),
        );
      pointer("pointerdown", 0, 0);
      pointer("pointermove", 2, 1);
      pointer("pointerup", 70, 35);
      const nodes = graph.snapshot().graphs.root.nodes;
      const result = { a: nodes.a.position, b: nodes.b.position };
      editor.destroy();
      return result;
    })
  );
  expect(results).toEqual([
    { a: { x: 72, y: 36 }, b: { x: 372, y: 76 } },
    { a: { x: 70, y: 35 }, b: { x: 370, y: 75 } },
  ]);
});

test("clicks, returning to the start, and canceled drags preserve off-grid positions", async ({ page }) => {
  const results = await page.evaluate(() =>
    ["click", "return", "cancel"].map((mode) => {
      const { editor, graph } = globalThis.nodeflowTest.fixture({
        touch: false,
        snapToGrid: 12,
        viewport: { x: 30, y: 30, scale: 1 },
      });
      graph.dispatch({
        type: "move-nodes",
        graphId: "root",
        positions: { a: { x: 7, y: 11 } },
      });
      const revision = graph.revision;
      const canvas = editor.canvas, rect = canvas.getBoundingClientRect();
      const start = editor.toScreen({ x: 87, y: 31 });
      const pointer = (type: string, x: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: "mouse",
            button: 0,
            bubbles: true,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: rect.x + start.x + x,
            clientY: rect.y + start.y,
          }),
        );
      pointer("pointerdown", 0);
      if (mode !== "click") pointer("pointermove", 45);
      if (mode === "cancel") pointer("pointercancel", 45);
      pointer("pointerup", mode === "cancel" ? 45 : 0);
      const result = {
        position: graph.snapshot().graphs.root.nodes.a.position,
        changes: graph.revision - revision,
      };
      editor.destroy();
      return result;
    })
  );
  for (const result of results) {
    expect(result).toEqual({ position: { x: 7, y: 11 }, changes: 0 });
  }
});

test("default dragging follows small pointer movements without grid jumps", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const positions: number[] = [];
    let scale = 1;
    const { editor, graph } = globalThis.nodeflowTest.fixture({
      touch: false,
      viewport: { x: 30, y: 30, scale: 1 },
      nodes: {
        motion: false,
        draw(view, defaults) {
          const transform = view.context.getTransform();
          positions.push(transform.e);
          scale = transform.a;
          defaults();
        },
      },
    });
    // Settle the initial ResizeObserver before recording the drag.
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    editor.render();
    const initial = positions.at(-1)!;
    const canvas = editor.canvas, rect = canvas.getBoundingClientRect();
    const pointer = (type: string, x: number, buttons: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: "mouse",
          button: 0,
          buttons,
          clientX: rect.x + 110 + x,
          clientY: rect.y + 50,
          bubbles: true,
        }),
      );
    pointer("pointerdown", 0, 1);
    const deltas: number[] = [];
    for (const x of [7, 8, 9, 10]) {
      pointer("pointermove", x, 1);
      // Input coalescing and rendering may occupy separate frames.
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      deltas.push((positions.at(-1)! - initial) / scale);
    }
    pointer("pointerup", 10, 0);
    const position = { ...graph.snapshot().graphs.root.nodes.a.position };
    editor.destroy();
    return { deltas, position };
  });
  expect(result.deltas).toEqual([7, 8, 9, 10]);
  expect(result.position).toEqual({ x: 10, y: 0 });
});
