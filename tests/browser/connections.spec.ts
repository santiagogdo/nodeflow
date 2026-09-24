import { expect, test } from "npm:@playwright/test@1.63.0";
import type {} from "./fixture.ts";
import type {
  ConnectionDrawContext,
  PortDrawContext,
} from "../../src/index.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.waitForFunction(() => !!globalThis.nodeflowTest);
});

test("ports are hollow when available and fill uniformly when connected, including custom sizes", async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor } = globalThis.nodeflowTest.network({
      theme: { surface: "#000000", portColors: { number: "#14dc5a" } },
      nodes: {
        draw(_view, defaults) {
          defaults(["ports"]);
        },
      },
      ports: { motion: false },
    });
    const sample = (node: string, radius: number, scale: number) => {
      const p = editor.getPortPosition(node, "in")!;
      editor.setViewport({ scale, x: 80 - p.x * scale, y: 80 - p.y * scale });
      editor.render();
      const ctx = editor.canvas.getContext("2d")!;
      const ratio = ctx.getTransform().a;
      const pixel = (offset: number) => [
        ...ctx.getImageData(
          Math.round(80 * ratio),
          Math.round((80 + offset * scale) * ratio),
          1,
          1,
        ).data,
      ];
      return { center: pixel(0), inner: pixel(radius * 0.6) };
    };
    const samples = [];
    for (const radius of [5, 12]) {
      if (radius === 12) {
        editor.setPortAppearance({ style: { radius }, motion: false });
      }
      for (const scale of [1, 3]) {
        samples.push({
          connected: sample("b", radius, scale),
          available: sample("d", radius, scale),
        });
      }
    }
    editor.destroy();
    return samples;
  });
  for (const sample of result) {
    expect(sample.connected.center).toEqual([20, 220, 90, 255]);
    expect(sample.connected.inner).toEqual([20, 220, 90, 255]);
    expect(sample.available.center).toEqual([0, 0, 0, 255]);
    expect(sample.available.inner).toEqual([0, 0, 0, 255]);
  }
});

test("full and partial painters own every zoom, isolate canvas state and preserve port layers", async ({ page }) => {
  const result = await page.evaluate(() => {
    const ports: { radius: number; color: string | null; detail: string }[] =
      [];
    const connections: { width: number; detail: string; scale: number }[] = [];
    const { editor } = globalThis.nodeflowTest.network({
      nodes: { motion: false },
      ports: {
        style: { radius: 8 },
        motion: false,
        draw(view) {
          if (view.node.id === "a") {
            ports.push({
              radius: view.style.radius,
              color: view.style.color,
              detail: view.detail,
            });
          }
          view.context.fillStyle = "rgb(20, 220, 90)";
          view.context.fillRect(view.point.x - 6, view.point.y - 6, 12, 12);
          view.context.translate(5000, 5000);
        },
      },
      extensions: [{
        presentations: [{
          type: "source",
          appearance: { ports: { style: { radius: 10, color: "red" } } },
        }],
      }],
      nodeAppearance: () => ({ ports: { style: { color: "blue" } } }),
      portAppearance: (node) =>
        node.id === "a" ? { style: { radius: 13 } } : undefined,
      connections: {
        style: { width: 4 },
        motion: false,
        draw(view) {
          connections.push({
            width: view.style.width,
            detail: view.detail,
            scale: view.context.getTransform().a,
          });
          view.context.fillStyle = "rgb(220, 50, 110)";
          view.context.fillRect(320, 110, 20, 20);
          view.context.translate(5000, 5000);
        },
      },
      connectionAppearance: () => ({ style: { width: 7 } }),
    });
    editor.render();
    const ctx = editor.canvas.getContext("2d")!;
    const pixel = (x: number, y: number) => {
      const p = editor.toScreen({ x, y });
      const ratio = ctx.getTransform().a;
      return [
        ...ctx.getImageData(
          Math.round(p.x * ratio),
          Math.round(p.y * ratio),
          1,
          1,
        ).data,
      ];
    };
    const portPoint = editor.getPortPosition("a", "out")!;
    const portPixel = pixel(portPoint.x, portPoint.y),
      edgePixel = pixel(325, 115);
    editor.setViewport({ scale: 0.3 });
    editor.render();
    editor.setViewport({ scale: 0.1 });
    editor.render();
    editor.destroy();
    return { ports, connections, portPixel, edgePixel };
  });
  expect(result.ports.map((p) => p.detail)).toEqual([
    "full",
    "compact",
    "overview",
  ]);
  expect(result.ports.every((p) => p.radius === 13 && p.color === "blue")).toBe(
    true,
  );
  expect(result.connections.map((p) => p.detail)).toEqual([
    "full",
    "compact",
    "overview",
  ]);
  expect(result.connections.every((p) => p.width === 7)).toBe(true);
  expect(result.portPixel).toEqual([20, 220, 90, 255]);
  expect(result.edgePixel).toEqual([220, 50, 110, 255]);
});

test("connection feedback respects types, occupied inputs and reconnection; preview snaps without mutating", async ({ page }) => {
  const result = await page.evaluate(() => {
    const views = new Map<string, PortDrawContext>();
    let preview: ConnectionDrawContext | undefined;
    const { editor, graph } = globalThis.nodeflowTest.network({
      ports: {
        motion: false,
        draw(view, defaults) {
          views.set(view.node.id, view);
          defaults();
        },
      },
      connections: {
        motion: false,
        draw(view, defaults) {
          if (view.pending) preview = view;
          defaults();
        },
      },
    });
    const event = (type: string, node: string, port: string, buttons = 0) => {
      const p = editor.toScreen(editor.getPortPosition(node, port)!);
      const b = editor.canvas.getBoundingClientRect();
      editor.canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
          button: 0,
          buttons,
          clientX: b.x + p.x,
          clientY: b.y + p.y,
        }),
      );
    };
    const click = (node: string, port: string) => {
      event("pointerdown", node, port, 1);
      event("pointerup", node, port);
    };
    const original = graph.serialize();
    click("a", "out");
    editor.render();
    const candidates = ["a", "b", "c", "d"].map((id) =>
      views.get(id)!.compatibility
    );
    event("pointermove", "c", "in");
    editor.render();
    const invalid = preview!.compatibility;
    event("pointermove", "d", "in");
    editor.render();
    const valid = preview!.compatibility;
    const snapped = preview!.geometry.target;
    const target = editor.getPortPosition("d", "in");
    const unchanged = graph.serialize() === original;
    editor.canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    event("pointerdown", "b", "in", 1);
    editor.render();
    const reconnectTarget = views.get("b")!.compatibility;
    const before = Object.keys(graph.snapshot().graphs.root.connections).length;
    event("pointermove", "d", "in", 1);
    event("pointerup", "d", "in");
    editor.render();
    const after = Object.values(graph.snapshot().graphs.root.connections).map(
      (e) => e.target.nodeId,
    );
    graph.undo();
    const undo = graph.serialize() === original;
    editor.destroy();
    return {
      candidates,
      invalid,
      valid,
      snapped,
      target,
      unchanged,
      reconnectTarget,
      before,
      after,
      undo,
    };
  });
  expect(result.candidates).toEqual(["none", "invalid", "invalid", "valid"]);
  expect(result.invalid).toBe("invalid");
  expect(result.valid).toBe("valid");
  expect(result.snapped).toEqual(result.target);
  expect(result.unchanged).toBe(true);
  expect(result.reconnectTarget).toBe("valid");
  expect(result.before).toBe(1);
  expect(result.after).toEqual(["d"]);
  expect(result.undo).toBe(true);
});

test("custom routes drive selection and follow a dragged endpoint", async ({ page }) => {
  const result = await page.evaluate(() => {
    let geometry: ConnectionDrawContext["geometry"] | undefined;
    const { editor, graph, edge } = globalThis.nodeflowTest.network({
      connections: {
        motion: false,
        geometry(g) {
          // A cubic arch, with matching sampled hit geometry.
          const c1 = { x: g.source.x, y: 0 }, c2 = { x: g.target.x, y: 0 };
          const samples = Array.from({ length: 25 }, (_, i) => {
            const t = i / 24, u = 1 - t;
            return {
              x: u ** 3 * g.source.x + 3 * u * u * t * c1.x +
                3 * u * t * t * c2.x + t ** 3 * g.target.x,
              y: u ** 3 * g.source.y + 3 * u * u * t * c1.y +
                3 * u * t * t * c2.y + t ** 3 * g.target.y,
            };
          });
          return {
            ...g,
            c1,
            c2,
            samples,
            bounds: {
              x: g.source.x,
              y: 0,
              width: g.target.x - g.source.x,
              height: Math.max(g.source.y, g.target.y),
            },
          };
        },
        draw(view, defaults) {
          geometry = view.geometry;
          defaults(["line"]);
        },
      },
    });
    const send = (type: string, x: number, y: number, buttons: number) => {
      const p = editor.toScreen({ x, y }),
        rect = editor.canvas.getBoundingClientRect();
      editor.canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerType: "mouse",
          pointerId: 1,
          button: 0,
          buttons,
          clientX: p.x + rect.x,
          clientY: p.y + rect.y,
        }),
      );
    };
    editor.render();
    const middle = geometry!.samples[12];
    send("pointerdown", middle.x, middle.y, 1);
    send("pointerup", middle.x, middle.y, 0);
    const selected = editor.getSelection().connections;
    const before = geometry!.source.x;
    send("pointerdown", 60, 70, 1);
    send("pointermove", 90, 90, 1);
    editor.render();
    const during = geometry!.source.x;
    send("pointerup", 90, 90, 0);
    editor.render();
    const after = geometry!.source.x;
    const nodeX = graph.snapshot().graphs.root.nodes.a.position.x;
    editor.destroy();
    return { selected, edge, before, during, after, nodeX };
  });
  expect(result.selected).toEqual([result.edge]);
  expect(result.during - result.before).toBe(30);
  expect(result.after).toBe(result.during);
  expect(result.nodeX).toBe(50);
});

test("motion settles, runs only for visible execution, honors disabling and live reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const setup = await page.evaluate(() => {
    const { editor } = globalThis.nodeflowTest.network({
      nodes: { motion: false },
      ports: { motion: false },
      connections: {
        draw(view, defaults) {
          document.body.dataset.flow = String(view.flowOffset);
          defaults();
        },
      },
    });
    // Expose operations as DOM buttons so subsequent state changes use real interactions.
    for (
      const [name, action] of Object.entries({
        run: () =>
          editor.setRuntimeState({
            a: { path: ["a"], status: "running", outputs: {} },
          }),
        stop: () => editor.setRuntimeState({}),
        hide: () => editor.setViewport({ x: -10000 }),
        show: () => editor.setViewport({ x: 0 }),
        disable: () => editor.setConnectionAppearance({ motion: false }),
        destroy: () => editor.destroy(),
      })
    ) {
      const b = document.createElement("button");
      b.textContent = name;
      b.onclick = action;
      document.body.append(b);
    }
    editor.on((e) => {
      if (e.type === "render") {
        document.body.dataset.frames = String(editor.metrics.frames);
      }
    });
    return true;
  });
  expect(setup).toBe(true);
  const frames = async () =>
    Number(await page.locator("body").getAttribute("data-frames"));
  await page.waitForTimeout(220);
  const idle = await frames();
  await page.waitForTimeout(100);
  expect(await frames()).toBe(idle);
  await page.getByRole("button", { name: "run", exact: true }).click();
  await page.waitForTimeout(100);
  const running = await frames();
  await page.waitForTimeout(100);
  expect(await frames()).toBeGreaterThan(running);
  await page.getByRole("button", { name: "hide", exact: true }).click();
  await page.waitForTimeout(80);
  const hidden = await frames();
  await page.waitForTimeout(100);
  expect(await frames()).toBe(hidden);
  await page.getByRole("button", { name: "show", exact: true }).click();
  await page.waitForTimeout(80);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  const reduced = await frames();
  await page.waitForTimeout(100);
  expect(await frames()).toBe(reduced);
  expect(await page.locator("body").getAttribute("data-flow")).toBe("0");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "disable", exact: true }).click();
  await page.waitForTimeout(100);
  const disabled = await frames();
  await page.waitForTimeout(100);
  expect(await frames()).toBe(disabled);
  await page.getByRole("button", { name: "destroy", exact: true }).click();
  await page.waitForTimeout(100);
  expect(await frames()).toBe(disabled);
});

test("keyboard port focus receives the same feedback and can complete a connection", async ({ page }) => {
  await page.evaluate(() => {
    const { editor } = globalThis.nodeflowTest.network({
      ports: {
        motion: false,
        draw(view, defaults) {
          if (view.focused) {
            document.body.dataset.focusedPort =
              `${view.node.id}:${view.port.definition.id}`;
            document.body.dataset.compatibility = view.compatibility;
          }
          defaults();
        },
      },
    });
    editor.setSelection({ nodes: ["a"] });
    editor.on(() => {
      document.body.dataset.edges = String(
        Object.keys(editor.document.snapshot().graphs.root.connections).length,
      );
    });
  });
  await page.getByRole("button", {
    name: "Source: Connect output out",
    exact: true,
  }).press("Enter");
  await expect(page.locator("body")).toHaveAttribute(
    "data-focused-port",
    "a:out",
  );
  await page.getByRole("combobox", { name: "Nodes in graph" }).selectOption(
    "d",
  );
  await page.getByRole("button", {
    name: "Sink: Connect input in",
    exact: true,
  }).focus();
  await expect(page.locator("body")).toHaveAttribute(
    "data-focused-port",
    "d:in",
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-compatibility",
    "valid",
  );
  await page.getByRole("button", {
    name: "Sink: Connect input in",
    exact: true,
  }).press("Enter");
  await expect(page.locator("body")).toHaveAttribute("data-edges", "2");
});

test("connection strokes grow with ports when zooming in and remain legible when zooming out", async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor } = window.nodeflowTest.network({
      theme: { canvas: "#000000", grid: "#000000" },
      nodes: { draw() {} },
      ports: { draw() {} },
      connections: {
        motion: false,
        style: {
          color: "#ffffff",
          opacity: 1,
          width: 4,
          outlineWidth: 0,
        },
      },
    });
    const a = editor.getPortPosition("a", "out")!,
      b = editor.getPortPosition("b", "in")!;
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const thickness = (scale: number) => {
      editor.setViewport({
        scale,
        x: 200 - middle.x * scale,
        y: 90 - middle.y * scale,
      });
      editor.render();
      const ctx = editor.canvas.getContext("2d")!, ratio = ctx.getTransform().a;
      const pixels = ctx.getImageData(
        Math.round(200 * ratio),
        Math.round(60 * ratio),
        1,
        Math.round(60 * ratio),
      ).data;
      let bright = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 127) bright++;
      return bright / ratio;
    };
    const normal = thickness(1), close = thickness(3), far = thickness(0.3);
    const pixelSize = 1 / editor.canvas.getContext("2d")!.getTransform().a;
    editor.destroy();
    return { normal, close, far, pixelSize };
  });
  // A rasterized boundary can round by one backing pixel at fractional DPR.
  expect(Math.abs(result.normal - 4)).toBeLessThanOrEqual(result.pixelSize);
  expect(Math.abs(result.close - 12)).toBeLessThanOrEqual(result.pixelSize);
  expect(result.close / result.normal).toBeCloseTo(3, 0);
  expect(result.far).toBeGreaterThanOrEqual(1);
});
