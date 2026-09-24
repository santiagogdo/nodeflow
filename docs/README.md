# Nodeflow integration guide

## Creating and disposing an editor

```ts
import { Editor, EventType } from 'nodeflow';
import type { EditorConfig, EditorState, NodeStyle } from 'nodeflow';
import 'nodeflow/style.css';

const editor = new Editor(container, {
  background: '#171421',
  grid: { spacing: 20, showMinorLines: true, color: '#77718e', locked: false },
});

// On unmount or when replacing the view:
editor.destroy();
```

The container must have a nonzero width and height. The editor observes changes to the container and handles device pixel ratio on resize. `destroy()` (also available as `dispose()`) is idempotent: it cancels scheduled frames and animations, removes DOM listeners, disconnects the resize observer, and removes only its own canvases and menu. Create a new editor to use the same container again. Mutating a destroyed editor throws.

## Graph operations

| Operation                                   | Interface                                                           |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Create a node                               | `editor.addNode({ id?, label?, position?, data?, ports?, style? })` |
| Inspect graph                               | `editor.getNodes()`, `editor.getConnections()`                      |
| Find by ID                                  | `editor.getNodeById(id)`, `editor.getConnectionById(id)`            |
| Connect                                     | `editor.connectPorts(portA, portB)`                                 |
| Disconnect                                  | `editor.disconnect(connection)` or `connection.disconnect()`        |
| Delete node and attached connections        | `editor.removeNode(id)`                                             |
| Clear graph and interaction/animation state | `editor.clear()`                                                    |

Nodes, ports, and connections have stable IDs. You may supply node and port IDs; IDs must be unique throughout the graph. Each connection is stored once. Connections require an input and an output belonging to this editor; supplying ports in reverse order is supported. Connecting an existing pair returns the existing connection. Self-connections return `undefined`; incompatible or foreign ports throw. Removing a missing node or disconnecting an already removed connection is a no-op.

`getNodes()` and `getConnections()` return fresh arrays containing live objects. Treat port collections and endpoint references as read-only; use the editor operations to change graph membership.

```ts
const node = editor.addNode({
  id: 'transform',
  label: 'Transform',
  position: { x: 100, y: 80 },
  data: { operation: 'multiply', factor: 2 },
  ports: [
    { id: 'in', type: 'input', position: { x: 0, y: 25 } },
    { id: 'out', type: 'output', position: { x: 0, y: 25 } },
  ],
  style: { fill: '#253343' },
});
node.position = { x: 180, y: 120 };
node.label = 'Multiply';
node.setStyle({ width: 180 });
```

Inputs attach to the left edge and outputs to the right. The supplied port `x` is ignored, and `y` is clamped to the node's height. Style overrides merge with defaults before ports are placed. Resizing a node updates its port positions.

## Styling and animation

Use `editor.setDefaultStyles({ node?, port?, connection? })` before adding nodes to change defaults for subsequently created components. Use `node.setStyle`, `port.setStyle`, or `connection.setStyle` for existing components. The compatibility property `editor.styleManager` and manager getters remain available for advanced use; ordinary editing does not require them.

```ts
editor.setDefaultStyles({
  node: {
    fill: '#253343',
    borderColor: { value: '#50657b', transition: true },
    hover: { borderColor: '#ffffff' },
  },
  connection: {
    dashArray: [12, 6],
    animation: {
      lineDashOffset: { from: 0, to: -18, duration: 1000, easing: 'linear', loop: true },
    },
  },
});
```

Transitions run for 150 ms on supported properties marked with `transition: true`. Explicit animations support numbers, colors, numeric arrays, and gradients. Easing values are `linear`, `ease-in`, `ease-out`, and `ease-in-out`; loop modes are `none` (restart), `ping-pong`, and `wrap-around`. Explicit animations take precedence over transitions. Use `editor.getAnimationManager().pauseAll()` and `.resumeAll()` to pause/resume animation playback.

Rendering is scheduled when graph, position, style, viewport, or interaction state changes, and while animations are active. `editor.render()` remains available for custom drawing integrations. There is one frame scheduler per editor.

## Viewport and interaction

```ts
editor.setViewport({ scale: 1.5, offsetX: 40, offsetY: 20 });
const viewport = editor.getViewport();
const world = editor.toWorld(canvasX, canvasY);
```

Scale is clamped to `0.1..5`. Coordinates passed to `toWorld` and `findComponentAt` are CSS pixels relative to the canvas, not page coordinates. Compatibility helpers `setScale`, `setOffsetX`, and `setOffsetY` remain supported.

Drag a node to move it, or drag empty space/middle-drag to pan. Scroll to zoom around the cursor. Click a port and then a compatible port to connect. Escape or clicking empty space cancels a pending connection. Pointer capture and window listeners handle releases outside the canvas.

Grid `spacing` sets the distance between minor grid elements. The older `size` setting remains a spacing fallback for compatibility; new integrations should use `spacing`. Major grid elements appear every fifth interval. `locked` keeps the background fixed during viewport changes.

## Events and context menus

```ts
const unsubscribe = editor.on(EventType.PORT_CONNECTED, (event) => {
  if (event) console.log(event.port.id, event.connectedPort.id);
});
unsubscribe();
```

`EventType` and `EventPayloads` are exported. Port connection/disconnection notifications apply to both programmatic and interactive changes. View and component interaction events are also available. `editor.customEvents` retains the free-form application event emitter (`on`, `off`, and `emit`).

By default, right-clicking a node offers deletion, and right-clicking the background offers creation. Menus are scoped to their editor. Disable them with `contextMenu: false`, or supply actions:

```ts
const editor = new Editor(container, {
  contextMenu: ({ node }) =>
    node
      ? [
          {
            label: 'Rename',
            onSelect: ({ node }) => {
              if (node) node.label = 'Renamed';
            },
          },
        ]
      : [],
});
```

Action callbacks receive `{ node?, position }`, where `position` is in graph coordinates. Items may set `disabled: true`.

## Persistence

```ts
const json = editor.serialize();
const state: EditorState = editor.toJSON(); // detached object
editor.deserialize(json); // accepts JSON or EditorState
const restored = new Editor(otherContainer, { initialState: state });
```

Version 1 stores node/port/connection IDs, labels, positions, JSON-compatible node data, base styles and animation definitions, default styles, and the viewport. It excludes hover/drag/selection state, animation playback progress, browser listeners, and editor configuration such as context-menu callbacks and grid settings. Restoring starts animations from their definitions and retains the receiving editor's configuration.

Loading replaces the graph. Validation checks the version, unique IDs, finite positions and viewport values, styles, animation definitions, endpoint membership, port direction, and duplicate connections before touching live state. Invalid input throws and leaves the existing graph unchanged. Saved IDs persist, but object references from before a load should be reacquired using those IDs.

Node data must contain JSON values. Cycles, non-finite numbers, BigInt, functions, and non-JSON objects cannot be saved. Optional undefined object fields are omitted by JSON serialization.

## Scope and compatibility

Nodeflow is a canvas editor library, not a workflow execution engine. It does not currently implement undo/redo, automatic graph layout, rich HTML nodes, or a full keyboard/screen-reader editing interface. The core supports pointer input; broader touch-device UX and browser compatibility should be evaluated for your application.

The current repository is undergoing stabilization. The package metadata retains the existing version; these development changes need a release before they are available from npm.
