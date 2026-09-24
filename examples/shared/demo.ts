import { Editor, EventType } from '../../src';
import type { AddNodeParams, EditorConfig, NewDefaultEditorStyles } from '../../src';

/** Shared controls keep each example focused on the feature it demonstrates. */
export function createDemo(
  styles: Partial<NewDefaultEditorStyles> = {},
  config: EditorConfig = {},
) {
  const container = document.getElementById('canvas-container')!;
  const summary = document.getElementById('graph-summary')!;
  const status = document.getElementById('status')!;
  const key = `nodeflow:${location.pathname}`;
  let editor = new Editor(container, config);
  editor.setDefaultStyles(styles);

  const updateSummary = () => {
    summary.textContent = `${editor.getNodes().length} nodes · ${editor.getConnections().length} connections`;
  };
  const subscribe = () => editor.on(EventType.SCENE_CHANGED, updateSummary);
  let unsubscribe = subscribe();
  const listeners = new AbortController();
  const button = (id: string, action: () => void) => {
    document.getElementById(id)?.addEventListener(
      'click',
      () => {
        try {
          action();
          updateSummary();
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : String(error);
        }
      },
      { signal: listeners.signal },
    );
  };
  const params = (kind: 'input' | 'output' | 'both'): AddNodeParams => ({
    label: kind === 'both' ? 'Transform' : kind === 'output' ? 'Source' : 'Destination',
    ports: (kind === 'both' ? (['input', 'output'] as const) : [kind]).map((type) => ({
      type,
      position: { x: 0, y: 25 },
    })),
  });
  button('clear-button', () => editor.clear());
  button('add-input-node-button', () => editor.addNode(params('input')));
  button('add-output-node-button', () => editor.addNode(params('output')));
  button('add-input-output-node-button', () => editor.addNode(params('both')));
  button('add-ten-input-node-button', () => {
    for (let i = 0; i < 10; i++) editor.addNode(params('input'));
  });
  button('add-ten-output-node-button', () => {
    for (let i = 0; i < 10; i++) editor.addNode(params('output'));
  });
  button('add-ten-input-output-node-button', () => {
    for (let i = 0; i < 5; i++) {
      const source = editor.addNode(params('both'));
      const target = editor.addNode(params('both'));
      editor.connectPorts(source.ports[1], target.ports[0]);
    }
  });
  button('save-button', () => {
    localStorage.setItem(key, editor.serialize());
    status.textContent = 'Graph saved in this browser.';
  });
  button('load-button', () => {
    const saved = localStorage.getItem(key);
    if (!saved) {
      status.textContent = 'Save a graph first.';
      return;
    }
    editor.deserialize(saved);
    status.textContent = 'Saved graph restored.';
  });
  button('recreate-button', () => {
    const saved = editor.serialize();
    unsubscribe();
    editor.destroy();
    editor = new Editor(container, { ...config, initialState: saved });
    unsubscribe = subscribe();
    status.textContent = 'Editor recreated with the same graph.';
  });

  const source = editor.addNode({ ...params('output'), position: { x: 60, y: 80 } });
  const target = editor.addNode({ ...params('input'), position: { x: 300, y: 180 } });
  editor.connectPorts(source.ports[0], target.ports[0]);
  // Fit the initial example on small screens; later resizing preserves the user's viewport.
  editor.setViewport({
    scale: Math.min(1, Math.max(0.1, (container.clientWidth - 32) / 440)),
  });
  updateSummary();
  window.addEventListener(
    'pagehide',
    () => {
      unsubscribe();
      listeners.abort();
      editor.destroy();
    },
    { once: true },
  );
}
