import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '../src/index';

describe('editor workflow', () => {
  let editor: Editor;
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
    editor = new Editor(container);
  });

  afterEach(() => {
    editor.destroy?.();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function pair() {
    const source = editor.addNode({
      position: { x: 50, y: 50 },
      ports: [{ type: 'output', position: { x: 0, y: 25 } }],
    });
    const target = editor.addNode({
      position: { x: 300, y: 50 },
      ports: [{ type: 'input', position: { x: 0, y: 25 } }],
    });
    editor.connectPorts(source.ports[0], target.ports[0]);
    return { source, target };
  }

  it('stores one connection and removes both endpoint references on node deletion', () => {
    const { source, target } = pair();
    expect(editor.getComponentManager().getConnections()).toHaveLength(1);
    editor.removeNode(source.id);
    expect(editor.getComponentManager().getConnections()).toHaveLength(0);
    expect(source.ports[0].connections).toHaveLength(0);
    expect(target.ports[0].connections).toHaveLength(0);
  });

  it('merges partial styles before positioning ports and keeps them attached on resize', () => {
    const node = editor.addNode({
      position: { x: 0, y: 0 },
      style: { fill: 'red' },
      ports: [{ type: 'output', position: { x: 0, y: 25 } }],
    });
    expect(node.ports[0].position).toEqual({ x: 120, y: 25 });
    node.setStyle({ width: 200, height: 20 });
    expect(node.ports[0].position).toEqual({ x: 200, y: 20 });
  });

  it('rejects ports from another editor without modifying either graph', () => {
    const other = new Editor(document.createElement('div'));
    try {
      const { source } = pair();
      const foreign = other.addNode({ ports: [{ type: 'input', position: { x: 0, y: 25 } }] });
      expect(() => editor.connectPorts(source.ports[0], foreign.ports[0])).toThrow(/belong/);
      expect(editor.getComponentManager().getConnections()).toHaveLength(1);
      expect(foreign.ports[0].connections).toHaveLength(0);
    } finally {
      other.destroy?.();
    }
  });

  it('round trips IDs, data, styles, connections, and viewport through JSON', () => {
    const { source } = pair();
    source.data = { nested: { enabled: true }, values: [1, 2] };
    source.setStyle({ fill: 'red', hover: { fill: 'blue' } });
    source.position = { x: 175, y: 80 };
    editor.setViewport({ scale: 2, offsetX: 30, offsetY: -20 });
    const saved = editor.serialize();
    editor.clear();
    editor.deserialize(saved);
    expect(editor.serialize()).toBe(saved);
    expect(editor.getNodes()[0].id).toBe(source.id);
    expect(editor.getNodes()[0].data).toEqual(source.data);
    expect(editor.getConnections()).toHaveLength(1);
    expect(editor.getConnections()[0].sourcePort.node).toBe(editor.getNodes()[0]);
    expect(editor.getViewport()).toEqual({ scale: 2, offsetX: 30, offsetY: -20 });
  });

  it('rejects invalid saved graphs without clearing the current graph', () => {
    pair();
    const saved = editor.serialize();
    const invalid = JSON.parse(saved);
    invalid.connections[0].targetPortId = 'missing';
    expect(() => editor.deserialize(invalid)).toThrow(/port/i);
    expect(editor.serialize()).toBe(saved);
    invalid.connections = [];
    invalid.nodes[1].id = invalid.nodes[0].id;
    expect(() => editor.deserialize(invalid)).toThrow(/id/i);
    expect(editor.serialize()).toBe(saved);
  });

  it('renders changes and then stops requesting frames while idle', () => {
    const render = vi.spyOn(editor, 'render');
    vi.advanceTimersByTime(100);
    render.mockClear();
    vi.advanceTimersByTime(100);
    expect(render).not.toHaveBeenCalled();
    const node = editor.addNode({ position: { x: 0, y: 0 } });
    vi.advanceTimersByTime(32);
    render.mockClear();
    node.position.x = 100;
    vi.advanceTimersByTime(32);
    expect(render).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('clears transient state and animations along with graph contents', () => {
    const { source, target } = pair();
    editor.setPendingConnectionPort(source.ports[0]);
    editor.setHoveredComponent(source);
    editor.clear();
    expect(editor.getPendingConnectionPort()).toBeNull();
    expect(editor.getHoveredComponent()).toBeNull();
    expect(source.ports[0].connections).toHaveLength(0);
    expect(target.ports[0].connections).toHaveLength(0);
    expect(editor.getAnimationManager().hasActiveAnimations()).toBe(false);
  });

  it('destroys idempotently and recreates in the same container without stale frames', () => {
    const existing = document.createElement('p');
    container.append(existing);
    const render = vi.spyOn(editor, 'render');
    editor.destroy();
    editor.destroy();
    vi.advanceTimersByTime(100);
    expect(render).not.toHaveBeenCalled();
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(existing);
    expect(() => editor.addNode({})).toThrow(/destroyed/);
    editor = new Editor(container);
    pair();
    expect(editor.getConnections()).toHaveLength(1);
  });
});
