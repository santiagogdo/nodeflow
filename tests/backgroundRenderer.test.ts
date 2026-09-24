import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '../src';
import type { EditorConfig } from '../src';

describe('background rendering', () => {
  const editors: Editor[] = [];
  function create(config: EditorConfig = {}) {
    const container = document.createElement('div');
    document.body.append(container);
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      toJSON() {},
    });
    const editor = new Editor(container, config);
    editors.push(editor);
    return editor;
  }
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
  });

  it('applies device pixel ratio, scale, and offset', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
    const editor = create({ grid: { spacing: 20, showMinorLines: true } });
    const ctx = editor.getBackgroundCanvas().getContext('2d')!;
    const scale = vi.spyOn(ctx, 'scale').mockClear();
    const translate = vi.spyOn(ctx, 'translate').mockClear();
    editor.setViewport({ scale: 2, offsetX: 50, offsetY: 100 });
    expect(editor.getBackgroundCanvas().width).toBe(1600);
    expect(scale).toHaveBeenNthCalledWith(1, 2, 2);
    expect(scale).toHaveBeenNthCalledWith(2, 2, 2);
    expect(translate).toHaveBeenLastCalledWith(25, 50);
  });

  it('keeps grid lines a constant screen width while zooming', () => {
    const editor = create({
      grid: { spacing: 20, showMinorLines: true, showMajorLines: true },
    });
    const ctx = editor.getBackgroundCanvas().getContext('2d')!;
    const width = vi.spyOn(ctx, 'lineWidth', 'set');
    editor.setScale(2);
    expect(width).toHaveBeenCalledWith(0.5);
    expect(width).toHaveBeenCalledWith(1);
  });

  it('draws minor lines across the visible viewport at configured spacing', () => {
    const editor = create({ grid: { spacing: 40, showMinorLines: true } });
    const ctx = editor.getBackgroundCanvas().getContext('2d')!;
    const move = vi.spyOn(ctx, 'moveTo').mockClear();
    editor.renderBackground();
    const verticals = move.mock.calls.filter(([, y]) => y === 0).map(([x]) => x);
    expect(verticals).toContain(0);
    expect(verticals).toContain(800);
    expect(verticals.every((x) => x % 40 === 0)).toBe(true);
    expect(move.mock.calls.length).toBeGreaterThan(20);
  });

  it('uses configured colors when rendering', () => {
    const editor = create({
      grid: {
        spacing: 20,
        color: 'rgba(255, 0, 0, 0.5)',
        showMinorLines: true,
        showMajorLines: true,
      },
    });
    const ctx = editor.getBackgroundCanvas().getContext('2d')!;
    const stroke = vi.spyOn(ctx, 'strokeStyle', 'set');
    editor.renderBackground();
    expect(stroke).toHaveBeenCalledWith('rgba(255, 0, 0, 0.1)');
    expect(stroke).toHaveBeenCalledWith('rgba(255, 0, 0, 0.375)');
  });

  it('leaves a locked grid fixed during viewport updates', () => {
    const editor = create({ grid: { spacing: 20, locked: true, showMinorLines: true } });
    const render = vi.spyOn(editor.getBackgroundRenderer(), 'render');
    editor.setViewport({ scale: 2, offsetX: 50, offsetY: 70 });
    expect(render).not.toHaveBeenCalled();
    editor.renderBackground();
    expect(render).toHaveBeenLastCalledWith({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('updates unlocked grids when panning through DOM input', () => {
    const editor = create({ grid: { spacing: 20, showMinorLines: true } });
    const canvas = editor.getCanvas();
    const render = vi.spyOn(editor.getBackgroundRenderer(), 'render');
    canvas.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }),
    );
    canvas.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 150, clientY: 170, bubbles: true }),
    );
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(editor.getViewport()).toEqual({ scale: 1, offsetX: 50, offsetY: 70 });
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenLastCalledWith(editor.getViewport());
  });

  it('restores context state even with an invalid grid configuration', () => {
    const editor = create({ grid: { spacing: -1, showMinorLines: true } });
    const ctx = editor.getBackgroundCanvas().getContext('2d')!;
    const save = vi.spyOn(ctx, 'save').mockClear();
    const restore = vi.spyOn(ctx, 'restore').mockClear();
    editor.renderBackground();
    expect(save).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
