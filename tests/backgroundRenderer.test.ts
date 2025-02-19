import { Editor } from '../src/core/editor/editor';
import { BackgroundRenderer, RenderTransform } from '../src/rendering/backgroundRenderer';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getRGBAString } from '../src/utils/getRgbaString';
import parseColor from '../src/core/animation/colorParser';

describe('BackgroundRenderer', () => {
  let editor: Editor;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let backgroundRenderer: BackgroundRenderer;
  let backgroundCanvas: HTMLCanvasElement;
  let backgroundCtx: CanvasRenderingContext2D;

  beforeEach(() => {
    // Create editor with grid config
    vi.mock('../src/core/contextMenu/contextMenu.ts', () => ({
      createContextMenu: () => document.createElement('div'),
      getContextMenu: () => document.createElement('div'),
      toggleContextMenu: () => {},
    }));

    editor = new Editor(document.createElement('div'), {
      grid: {
        size: 20,
        color: 'rgba(255, 255, 255, 0.8)',
        showMinorLines: true,
        showMajorLines: true,
        showDots: true,
        showCrosses: true,
      },
    });

    canvas = editor.getCanvas();
    ctx = canvas.getContext('2d')!;
    backgroundRenderer = editor.getBackgroundRenderer();
    backgroundCanvas = editor.getBackgroundCanvas();
    backgroundCtx = backgroundCanvas.getContext('2d')!;
  });

  it('should apply correct transformations before rendering the grid', () => {
    const transform: RenderTransform = {
      scale: 2,
      offsetX: 50,
      offsetY: 100,
    };

    // Fake a high device pixel ratio
    const devicePixelRatio = 2;
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(devicePixelRatio);

    // Spy on context methods
    const saveSpy = vi.spyOn(backgroundCtx, 'save').mockClear();
    const scaleSpy = vi.spyOn(backgroundCtx, 'scale').mockClear();
    const translateSpy = vi.spyOn(backgroundCtx, 'translate').mockClear();
    const restoreSpy = vi.spyOn(backgroundCtx, 'restore').mockClear();

    // Account for the initial render
    backgroundRenderer.render(transform);

    // Check transform call order
    expect(saveSpy).toHaveBeenCalled(); // Should save context state
    expect(scaleSpy).toHaveBeenNthCalledWith(1, devicePixelRatio, devicePixelRatio);
    expect(scaleSpy).toHaveBeenNthCalledWith(2, transform.scale, transform.scale);
    expect(translateSpy).toHaveBeenCalledWith(
      transform.offsetX / transform.scale,
      transform.offsetY / transform.scale
    );
    expect(restoreSpy).toHaveBeenCalled(); // Should restore after rendering
  });

  it('should scale the grid line width based on the current zoom level', () => {
    const transform = {
      scale: 2,
      offsetX: 0,
      offsetY: 0,
    };

    // Spy on the lineWidth setter
    const lineWidthSpy = vi.spyOn(backgroundCtx, 'lineWidth', 'set');

    backgroundRenderer.render(transform);

    // Line width should be 1 / transform.scale = 0.5
    expect(lineWidthSpy).toHaveBeenCalledWith(0.5);
  });

  it('should render only the visible grid elements within the canvas viewport', () => {
    const transform = {
      scale: 1,
      offsetX: 100,
      offsetY: 100,
    };

    const clearRectSpy = vi.spyOn(backgroundCtx, 'clearRect').mockClear();
    const moveSpy = vi.spyOn(backgroundCtx, 'moveTo').mockClear();
    const lineSpy = vi.spyOn(backgroundCtx, 'lineTo').mockClear();

    // Account for the initial render
    backgroundRenderer.render(transform);

    // 1) Verify the entire canvas was cleared in device coordinates:
    expect(clearRectSpy).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);

    // 2) Collect all calls to moveTo(...) and lineTo(...).
    //    NOTE: these are in "world" coords because of the transforms you apply.
    const allCalls = [...moveSpy.mock.calls, ...lineSpy.mock.calls];

    // 3) Recompute the same bounding box the code uses in "world" coordinates:
    const devicePixelRatio = editor.getDevicePixelRatio(); // or backgroundRenderer.editor.getDevicePixelRatio()
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    // The unscaled (world) width & height of the viewport
    const unscaledWidth = canvasWidth / devicePixelRatio / transform.scale;
    const unscaledHeight = canvasHeight / devicePixelRatio / transform.scale;

    // The top-left corner in world coords
    const viewportLeft = -transform.offsetX / transform.scale;
    const viewportTop = -transform.offsetY / transform.scale;

    const viewportRight = viewportLeft + unscaledWidth;
    const viewportBottom = viewportTop + unscaledHeight;

    // The minor grid size from your config
    const minorGridSize = editor.editorConfig?.grid?.size || 20;

    // startX..endX, startY..endY as in BackgroundRenderer
    const startX = Math.floor(viewportLeft / minorGridSize) * minorGridSize;
    const startY = Math.floor(viewportTop / minorGridSize) * minorGridSize;
    const endX = Math.ceil(viewportRight / minorGridSize) * minorGridSize;
    const endY = Math.ceil(viewportBottom / minorGridSize) * minorGridSize;

    // 4) Check that each line coordinate is within the computed bounding box
    for (const [worldX, worldY] of allCalls) {
      expect(worldX).toBeGreaterThanOrEqual(startX);
      expect(worldX).toBeLessThanOrEqual(endX);
      expect(worldY).toBeGreaterThanOrEqual(startY);
      expect(worldY).toBeLessThanOrEqual(endY);
    }
  });

  it('should use the provided grid configuration (size, color, etc.) when rendering', () => {
    // Re-create editor with a different grid config
    editor = new Editor(document.createElement('div'), {
      grid: {
        size: 40, // Larger grid size
        color: 'rgba(255, 0, 0, 0.5)', // Different color
        showMinorLines: true,
        showMajorLines: true,
        showDots: false,
        showCrosses: false,
      },
    });

    backgroundRenderer = new BackgroundRenderer(editor, backgroundCtx);

    // Spy on strokeStyle and lineWidth
    const strokeStyleSpy = vi.spyOn(backgroundCtx, 'strokeStyle', 'set');
    const lineWidthSpy = vi.spyOn(backgroundCtx, 'lineWidth', 'set');

    backgroundRenderer.render({ scale: 1, offsetX: 0, offsetY: 0 });

    // Make sure it actually sets the correct stroke color
    const gridColor = parseColor(editor.editorConfig?.grid?.color!);
    if (!gridColor) return;
    const minorColor = { ...gridColor, a: gridColor.a * 0.2 };
    const majorColor = { ...gridColor, a: gridColor.a * 0.75 };

    // Verify minor grid lines use correct color and width
    expect(strokeStyleSpy).toHaveBeenCalledWith(getRGBAString(minorColor));
    expect(lineWidthSpy).toHaveBeenCalledWith(1); // At scale 1

    // Verify major grid lines use correct color and width
    expect(strokeStyleSpy).toHaveBeenCalledWith(getRGBAString(majorColor));
    expect(lineWidthSpy).toHaveBeenCalledWith(2); // At scale 1

    // Verify grid size by checking line positions
    const moveSpy = vi.spyOn(backgroundCtx, 'moveTo');
    const lineSpy = vi.spyOn(backgroundCtx, 'lineTo');
    const allCalls = [...moveSpy.mock.calls, ...lineSpy.mock.calls];

    // Sample some coordinates to verify 40px grid spacing
    const gridPositions = allCalls.map((call) => call[0]).filter((x) => x !== 0);
    const uniquePositions = [...new Set(gridPositions)];
    const spacings = uniquePositions.slice(1).map((pos, i) => pos - uniquePositions[i]);

    spacings.forEach((spacing) => {
      expect(spacing).toBe(40);
    });
  });

  it('should translate the grid by the correct offset during pan operations', () => {
    const initialTransform = {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    };

    const pannedTransform = {
      scale: 1,
      offsetX: 50,
      offsetY: 50,
    };

    const translateSpy = vi.spyOn(backgroundCtx, 'translate');

    // Render initial grid
    backgroundRenderer.render(initialTransform);
    // The first translate call (after devicePixelRatio & scale) is the offset
    const [initX, initY] = translateSpy.mock.calls.at(-1) || [0, 0];

    // Render panned grid
    backgroundRenderer.render(pannedTransform);
    // The next translate call after clearing old calls
    const [panX, panY] = translateSpy.mock.calls.at(-1) || [0, 0];

    // Expect an increase of 50 in each direction
    // (assuming the only difference is the offset)
    expect(panX - initX).toBe(50);
    expect(panY - initY).toBe(50);
  });

  it('should not re-render grid when locked and panning', () => {
    const container = document.createElement('div');
    editor = new Editor(container, {
      grid: { size: 20, color: 'rgba(255, 255, 255, 0.8)', locked: true },
    });

    canvas = editor.getCanvas();

    // Spy on rendering
    const renderSpy = vi.spyOn(editor.getBackgroundRenderer(), 'render');

    // Increment the call count to account for the initial render
    editor.getBackgroundRenderer().render({ scale: 1, offsetX: 0, offsetY: 0 });

    // Initial render happens in constructor
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // Simulate panning through DOM events
    canvas.dispatchEvent(
      new MouseEvent('mousedown', {
        button: 0, // Left click
        clientX: 100,
        clientY: 100,
      })
    );

    canvas.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: 150,
        clientY: 150,
      })
    );

    canvas.dispatchEvent(new MouseEvent('mouseup'));

    // Because grid is locked, no additional renders should occur
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenLastCalledWith({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('should re-render grid when unlocked and panning', () => {
    const container = document.createElement('div');
    editor = new Editor(container, {
      grid: {
        size: 20,
        color: 'rgba(255, 255, 255, 0.8)',
        locked: false,
      },
    });

    canvas = editor.getCanvas();

    // Spy on the render method
    backgroundRenderer = editor.getBackgroundRenderer();
    const renderSpy = vi.spyOn(backgroundRenderer, 'render');
    // Increment the call count to account for the initial render
    backgroundRenderer.render({ scale: 1, offsetX: 0, offsetY: 0 });

    // Initial render happens in constructor
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // Verify the initial render call had the initial transforms
    expect(renderSpy).toHaveBeenLastCalledWith({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });

    // Simulate panning through DOM events
    canvas.dispatchEvent(
      new MouseEvent('mousedown', {
        button: 0, // Left click
        clientX: 100,
        clientY: 100,
      })
    );

    canvas.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: 150,
        clientY: 150,
      })
    );

    canvas.dispatchEvent(new MouseEvent('mouseup'));

    // Verify that render was called with updated transforms
    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(renderSpy).toHaveBeenLastCalledWith({
      scale: 1,
      offsetX: 50, // difference between mousedown and mousemove X
      offsetY: 50, // difference between mousedown and mousemove Y
    });
  });
});
