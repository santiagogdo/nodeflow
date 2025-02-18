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

  beforeEach(() => {
    // Create a canvas element
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;

    // Get the 2D context
    ctx = canvas.getContext('2d')!;

    // Create editor with grid config
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

    backgroundRenderer = new BackgroundRenderer(editor, ctx);
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
    const saveSpy = vi.spyOn(ctx, 'save');
    const scaleSpy = vi.spyOn(ctx, 'scale');
    const translateSpy = vi.spyOn(ctx, 'translate');
    const restoreSpy = vi.spyOn(ctx, 'restore');

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
    const lineWidthSpy = vi.spyOn(ctx, 'lineWidth', 'set');

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

    const clearRectSpy = vi.spyOn(ctx, 'clearRect');
    const moveSpy = vi.spyOn(ctx, 'moveTo');
    const lineSpy = vi.spyOn(ctx, 'lineTo');

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

    backgroundRenderer = new BackgroundRenderer(editor, ctx);

    // Spy on strokeStyle
    const strokeStyleSpy = vi.spyOn(ctx, 'strokeStyle', 'set');

    backgroundRenderer.render({ scale: 1, offsetX: 0, offsetY: 0 });

    // Make sure it actually sets the correct stroke color
    const gridColor = parseColor(editor.editorConfig?.grid?.color!);
    if (!gridColor) return;
    const minorColor = { ...gridColor, a: gridColor.a * 0.2 };
    const majorColor = { ...gridColor, a: gridColor.a * 0.75 };
    expect(strokeStyleSpy).toHaveBeenCalledWith(getRGBAString(minorColor));
    expect(strokeStyleSpy).toHaveBeenCalledWith(getRGBAString(majorColor));
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

    const translateSpy = vi.spyOn(ctx, 'translate');

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
});
