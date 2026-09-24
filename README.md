[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

# Nodeflow

Nodeflow is a small, framework-independent TypeScript library for graphical node editors. It renders nodes, ports, and connections on canvas, with configurable styles, animations, zoom, and panning.

The current development version is being stabilized. The supported editor workflow is creating, connecting, moving, styling, deleting, saving, restoring, and disposing an editor. Undo/redo, automatic layout, rich HTML node content, and a complete keyboard editing interface are not implemented.

## Installation

```sh
npm install nodeflow
```

Give the editor a container with an explicit height, then import the library and its context-menu stylesheet:

```html
<div id="canvas-container" style="height: 500px"></div>
```

```typescript
import { Editor } from 'nodeflow';
import 'nodeflow/style.css';

const container = document.getElementById('canvas-container');
if (!container) throw new Error('Editor container not found');

const editor = new Editor(container, {
  grid: { spacing: 20, showDots: true, color: '#77718e' },
});

const source = editor.addNode({
  label: 'Source',
  position: { x: 60, y: 80 },
  ports: [{ type: 'output', position: { x: 0, y: 25 } }],
});
const target = editor.addNode({
  label: 'Destination',
  position: { x: 300, y: 180 },
  ports: [{ type: 'input', position: { x: 0, y: 25 } }],
});
const connection = editor.connectPorts(source.ports[0], target.ports[0]);

// JSON includes IDs, graph data, styles, and viewport.
const saved = editor.serialize();
editor.deserialize(saved);

// Call when the containing view unmounts.
editor.destroy();
```

## Supported features

- Nodes, input/output ports, unique connections, and consistent deletion.
- Per-component styles, gradients, hover transitions, and looping animations.
- High-DPI rendering and container resizing through `ResizeObserver`.
- Pointer dragging, panning, cursor-centered zoom, and Escape to cancel a connection.
- Independent, customizable context menus for multiple editor instances.
- Versioned JSON persistence, validated before replacing the current graph.
- Rendering on changes and during animations; idle editors stop requesting frames.
- Explicit cleanup of frames, browser listeners, observers, and animations.
- Optional FPS display measuring rendered frames while the editor is active.

## Examples and development

```sh
npm ci
npm run example basic
npm run example styling-components
npm run example animating-connections
```

Each example includes save/load, clear, and editor recreation controls. Graphs saved by an example stay in that browser's local storage.

```sh
npm run check       # typecheck, test, build, verify package consumers
npm run test:watch
npm run coverage
```

See the [API and integration guide](docs/README.md) and [contribution guidelines](CONTRIBUTING.md).

## Help and license

Report problems in [issues](https://github.com/santiagogdo/nodeflow/issues) or ask questions in [discussions](https://github.com/santiagogdo/nodeflow/discussions).

MIT — see [LICENSE](LICENSE).
