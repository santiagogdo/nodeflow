import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor, EventType } from '../src';

const editors: Editor[] = [];
function create() {
  const container = document.createElement('div');
  document.body.append(container);
  const editor = new Editor(container);
  editors.push(editor);
  return { editor, container, canvas: editor.getCanvas() };
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

describe('browser lifecycle and input', () => {
  it('observes container changes and disconnects on destruction', () => {
    let notify!: ResizeObserverCallback;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          notify = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    try {
      const { editor, container, canvas } = create();
      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        width: 420,
        height: 200,
      } as DOMRect);
      notify([], {} as ResizeObserver);
      expect(observe).toHaveBeenCalledWith(container);
      expect(canvas.width).toBe(420 * window.devicePixelRatio);
      expect(editor.getBackgroundCanvas().height).toBe(200 * window.devicePixelRatio);
      editor.destroy();
      expect(disconnect).toHaveBeenCalledOnce();
      canvas.width = 7;
      window.dispatchEvent(new Event('resize'));
      notify([], {} as ResizeObserver);
      expect(canvas.width).toBe(7);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ends dragging when released outside the canvas', () => {
    const { editor, canvas } = create();
    const node = editor.addNode({ position: { x: 100, y: 100 } });
    canvas.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 110, clientY: 110, bubbles: true }),
    );
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 210, clientY: 160 }));
    expect(node.position).toEqual({ x: 200, y: 150 });
    window.dispatchEvent(new MouseEvent('mouseup'));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 310, clientY: 260 }));
    expect(node.position).toEqual({ x: 200, y: 150 });
  });

  it('keeps the world point under the cursor fixed when zooming', () => {
    const { editor, canvas } = create();
    editor.setViewport({ scale: 2, offsetX: 20, offsetY: -10 });
    const before = editor.toWorld(200, 150);
    canvas.dispatchEvent(
      new WheelEvent('wheel', { clientX: 200, clientY: 150, deltaY: -100 }),
    );
    expect(editor.toWorld(200, 150).x).toBeCloseTo(before.x);
    expect(editor.toWorld(200, 150).y).toBeCloseTo(before.y);
  });

  it('isolates context menus between editors and deletes through their owning graph', () => {
    const first = create(),
      second = create();
    const node = second.editor.addNode({ position: { x: 100, y: 100 } });
    second.canvas.dispatchEvent(
      new MouseEvent('mousedown', { button: 2, clientX: 110, clientY: 110, bubbles: true }),
    );
    expect(first.editor.getContextMenuElement().hidden).toBe(true);
    expect(second.editor.getContextMenuElement().hidden).toBe(false);
    second.editor.getContextMenuElement().querySelector('button')!.click();
    expect(second.editor.getNodeById(node.id)).toBeUndefined();
    expect(second.editor.getContextMenuElement().hidden).toBe(true);
  });

  it('disconnects exactly once through a returned connection and supports event unsubscribe', () => {
    const { editor } = create();
    const nodeA = editor.addNode({ ports: [{ type: 'output', position: { x: 0, y: 25 } }] });
    const nodeB = editor.addNode({ ports: [{ type: 'input', position: { x: 0, y: 25 } }] });
    const connected = vi.fn(),
      disconnected = vi.fn();
    const unsubscribe = editor.on(EventType.PORT_CONNECTED, connected);
    editor.on(EventType.PORT_DISCONNECTED, disconnected);
    const connection = editor.connectPorts(nodeA.ports[0], nodeB.ports[0])!;
    expect(editor.connectPorts(nodeB.ports[0], nodeA.ports[0])).toBe(connection);
    expect(connected).toHaveBeenCalledOnce();
    connection.disconnect();
    connection.disconnect();
    expect(disconnected).toHaveBeenCalledOnce();
    unsubscribe();
    editor.connectPorts(nodeA.ports[0], nodeB.ports[0]);
    expect(connected).toHaveBeenCalledOnce();
  });

  it('updates animations once per frame, stops while paused, and cancels on node removal', () => {
    const { editor } = create();
    const node = editor.addNode({
      style: {
        animation: {
          borderRadius: { from: 0, to: 20, duration: 1000, easing: 'linear', loop: true },
        },
      },
    });
    const manager = editor.getAnimationManager();
    const update = vi.spyOn(manager, 'update');
    vi.advanceTimersByTime(32);
    expect(update).toHaveBeenCalledTimes(2);
    manager.pauseAll();
    vi.advanceTimersByTime(32);
    update.mockClear();
    vi.advanceTimersByTime(100);
    expect(update).not.toHaveBeenCalled();
    manager.resumeAll();
    vi.advanceTimersByTime(32);
    expect(update).toHaveBeenCalledTimes(2);
    editor.removeNode(node.id);
    vi.advanceTimersByTime(32);
    update.mockClear();
    vi.advanceTimersByTime(100);
    expect(update).not.toHaveBeenCalled();
    expect(manager.activeAnimations.size).toBe(0);
  });

  it('starts animations added to an existing component and cancels replaced definitions', () => {
    const { editor } = create();
    const node = editor.addNode({});
    node.setStyle({
      animation: { borderWidth: { from: 1, to: 5, duration: 100, easing: 'linear' } },
    });
    vi.advanceTimersByTime(48);
    expect(
      editor.getAnimationManager().activeAnimations.get(node)?.borderWidth,
    ).toBeGreaterThan(1);
    node.setStyle({
      animation: { borderWidth: { from: 10, to: 20, duration: 100, easing: 'linear' } },
    });
    vi.advanceTimersByTime(48);
    expect(
      editor.getAnimationManager().activeAnimations.get(node)?.borderWidth,
    ).toBeGreaterThan(10);
  });

  it('transitions from zero and releases completed transition overrides', () => {
    const { editor } = create();
    const node = editor.addNode({ style: { borderWidth: { value: 0, transition: true } } });
    node.setStyle({ borderWidth: 10 });
    vi.advanceTimersByTime(80);
    const value = editor.getAnimationManager().activeTransitions.get(node)?.borderWidth;
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(10);
    vi.advanceTimersByTime(100);
    expect(editor.getAnimationManager().activeTransitions.size).toBe(0);
  });
});
