import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '../src';
import type { EditorState } from '../src';

describe('persisted graphs', () => {
  let editor: Editor;
  beforeEach(() => {
    editor = new Editor(document.createElement('div'));
  });
  afterEach(() => editor.destroy());

  it('loads initial state and detaches saved data from live objects', () => {
    editor.addNode({ id: 'source', data: { nested: { value: 3 } } });
    const state = editor.toJSON();
    const restored = new Editor(document.createElement('div'), { initialState: state });
    try {
      expect(restored.serialize()).toBe(editor.serialize());
      (state.nodes[0].data.nested as { value: number }).value = 7;
      expect(restored.getNodes()[0].data.nested).toEqual({ value: 3 });
      expect(editor.getNodes()[0].data.nested).toEqual({ value: 3 });
    } finally {
      restored.destroy();
    }
  });

  it('persists base styles instead of hover styles', () => {
    const node = editor.addNode({ style: { fill: '#123456', hover: { fill: '#654321' } } });
    const before = editor.serialize();
    node.handleHover(true);
    expect(editor.serialize()).toBe(before);
    node.handleHover(false);
    expect(editor.serialize()).toBe(before);
  });

  it.each([
    [
      'version',
      (state: EditorState) => {
        state.version = 42 as 1;
      },
    ],
    [
      'position',
      (state: EditorState) => {
        state.nodes[0].position.x = NaN;
      },
    ],
    [
      'dimensions',
      (state: EditorState) => {
        state.nodes[0].style.width = -1;
      },
    ],
    [
      'color stop',
      (state: EditorState) => {
        state.nodes[0].style.fill = {
          type: 'linear',
          colorStops: [{ color: '#fff', offset: 2 }],
        };
      },
    ],
    [
      'animation',
      (state: EditorState) => {
        state.nodes[0].style.animation = {
          borderWidth: { from: 0, to: 2, duration: 0, easing: 'linear' },
        };
      },
    ],
  ])('rejects invalid %s before replacing live state', (_, corrupt) => {
    editor.addNode({ id: 'existing' });
    const before = editor.serialize();
    const state = editor.toJSON();
    corrupt(state);
    expect(() => editor.deserialize(state)).toThrow();
    expect(editor.serialize()).toBe(before);
  });

  it('preserves style edits made while a node is hovered', () => {
    const node = editor.addNode({ style: { fill: '#123456', hover: { fill: '#654321' } } });
    node.handleHover(true);
    node.setStyle({ fill: '#112233' });
    expect(editor.toJSON().nodes[0].style.fill).toBe('#112233');
    node.handleHover(false);
    expect(editor.getStyleManager().getNodeStyle(node)?.currentState.fill).toBe('#112233');
  });

  it('round trips standard CSS named colors', () => {
    editor.addNode({ style: { fill: 'tomato', borderColor: 'black', labelColor: 'white' } });
    const saved = editor.serialize();
    editor.deserialize(saved);
    expect(editor.serialize()).toBe(saved);
  });

  it('replaces defaults without inheriting optional styles from the receiving editor', () => {
    editor.addNode({});
    const state = editor.toJSON();
    editor.setDefaultStyles({
      node: {
        hover: { fill: '#ffffff' },
        animation: { borderWidth: { from: 0, to: 3, easing: 'linear' } },
      },
    });
    editor.deserialize(state);
    expect(editor.toJSON()).toEqual(state);
  });

  it('rejects circular and non-JSON data without mutating the graph', () => {
    const node = editor.addNode({});
    node.data.self = node.data;
    expect(() => editor.serialize()).toThrow(/circular/);
    delete node.data.self;
    node.data.big = 2n;
    expect(() => editor.serialize()).toThrow(/JSON/);
    expect(editor.getNodes()).toEqual([node]);
  });
});
