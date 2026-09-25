# Nodeflow v2 API and architecture

## Boundaries

`GraphDocument` owns persistent state and history. The editor owns viewport,
selection, hit testing, input sessions, and rendering. `Runner` consumes
snapshots without mutating documents. Layout consumes measured rectangles and
endpoint node IDs, and returns positions without editing a graph. Applications
decide when to commit layout or execution-related configuration.

There is one immutable document model, one geometry model used for rendering and
hit testing, and one command boundary for persistent edits. Definitions describe
domain behavior; presentations describe visual controls; executors describe
computation. None needs to import the other two.

The package contains only first-party code. Browser built-ins provide Canvas 2D,
Pointer Events, native input, ResizeObserver, animation frames, and Worker
messaging. Headless modules import no DOM code. Node 22+ and current evergreen
browsers are the development targets. Consumers need ES2022 platform support and
`crypto.randomUUID`; constructing an editor also requires Canvas 2D and a sized
host element.

## Registry

```ts
const registry = new NodeRegistry().register({
  type: "scale",
  title: "Scale",
  category: "Transform",
  defaults: { factor: 2 },
  ports: [
    { id: "in", direction: "input", dataType: "number" },
    { id: "out", direction: "output", dataType: "number" },
  ],
  validate(data) {
    if (typeof data.factor !== "number") {
      throw new Error("A factor is required");
    }
  },
});
```

Port IDs are unique within a node, across both directions. Port types must
match, unless either type is `any`. These are connection compatibility labels,
not runtime value schemas. Use node validation and executors for
application-specific value validation. Inputs accept one connection unless
`multiple: true`. Multi-input values arrive as arrays in connection order.
`side` may be left/right/top/bottom; default sides follow direction. Ports may
be a function of node data. A data change that invalidates existing connections
is rejected atomically; disconnect affected edges in the same transaction when
changing a node’s interface.

Registered types cannot start with `@`. The reserved types are `@subgraph`,
`@input`, and `@output`. `registry.list()` returns definitions;
`registry.ports(node, graph, snapshot)` resolves ordinary and nested interfaces.

## Document and commands

```ts
const doc = new GraphDocument(registry, {
  initialState: jsonOrSnapshot, // optional
  historyLimit: 100, // 0 disables history
});
const id = doc.addNode({ type: "scale", label: "Double", data: { factor: 2 } });
doc.dispatch({
  type: "update-node",
  nodeId: id,
  changes: { label: "Multiply" },
});
doc.transaction("Move together", () => {
  doc.dispatch({ type: "move-nodes", positions: { [id]: { x: 80, y: 60 } } });
});
```

Commands accept an optional `graphId`, defaulting to the root graph:

| Command         | Payload                                                              |
| --------------- | -------------------------------------------------------------------- |
| `add-node`      | `node: { type, id?, label?, data?, position?, width?, subgraphId? }` |
| `update-node`   | `nodeId`, `changes: { label?, data?, position?, width? }`            |
| `move-nodes`    | `positions: Record<nodeId, { x, y }>`                                |
| `connect`       | `source`, `target`, optional `id`, `label`                           |
| `disconnect`    | `connectionId`                                                       |
| `remove`        | Optional `nodeIds`, `connectionIds`, `groupIds`                      |
| `add-group`     | `group: { id, label, nodeIds, parentId?, color? }`                   |
| `update-group`  | `groupId`, `changes`                                                 |
| `ungroup`       | `groupId`                                                            |
| `rename-graph`  | `label`                                                              |
| `set-interface` | `inputs`, `outputs`                                                  |
| `add-graph`     | Complete `graph`                                                     |
| `remove-graph`  | `id`                                                                 |

`addNode()` and `connect()` return generated IDs.
`dispatch(add-node/connect/add-group/add-graph)` also returns the new ID. Data
updates merge keys. Node deletion removes its incident connections and group
membership. Removing a group via `ungroup` preserves its members; editor Delete
on a selected group removes its contained nodes.

Transactions are synchronous and nest into one validated change. A failed
command poisons the whole transaction, even if the callback catches its error.
Validation errors do not change state, history, or events. A transaction emits
once. Observer failures do not roll back successful changes.

`snapshot()` is deeply frozen; `serialize()` produces deterministic JSON.
`load()` validates a replacement before applying it and clears history. History
stores command-result patches, not full snapshot copies. `undo()`, `redo()`,
`canUndo`, `canRedo`, `revision`, and `subscribe(change => ...)` are public. The
default retains 100 transactions. Pointer drags, slider drags, text sessions,
paste, extraction, and layout commit once.

Documents have `{ version: 2, rootGraphId, graphs }`. Each graph contains maps
of nodes, connections, and groups, plus `inputs` and `outputs`. Configurations
must be plain finite JSON. IDs are unique across nodes/connections/groups in
each graph; separate graph definitions have separate ID namespaces. Dangling
endpoints, incompatible ports, duplicate edges, multiple single-input
connections, recursive subgraph definitions, and group hierarchy cycles are
rejected. Ordinary connection cycles are allowed.

## Groups, fragments, reusable graphs

Groups contain immediate node IDs and an optional parent group. A node has at
most one immediate group. Visual bounds are derived from descendants. Layout
honors this hierarchy.

`copy(nodeIds, graphId?)` returns a serializable `nodeflow/fragment` containing
selected nodes, internal edges, complete groups, and referenced definitions.
`paste(fragment, graphId?, offset?)` remaps identities atomically, including
referenced definition IDs, and returns the new root node IDs. Clipboard paste
and Duplicate make independent copies of referenced definitions. To share a
definition, add another `@subgraph` node with the same `subgraphId`.

`createSubgraph(nodeIds, graphId?)` extracts the selection into a new definition
and returns its instance node ID. Internal edges and complete groups move into
that definition. Crossing edges are rewritten through explicit graph interfaces
and terminal nodes. Undo restores the original topology.

A graph input is a `GraphPort` and a node of type `@input` with `data.portId`
referring to it; that node exposes one output named `value`. A graph output uses
`@output` with one input named `value`. A `@subgraph` node references a
definition with `subgraphId` and exposes its interface ports. Input and output
IDs must remain distinct when used by an instance. Interfaces are first-class
document data; an application may expose a schema editor using `set-interface`
and terminal commands in one transaction.

## Canvas editor

```ts
import { Editor } from "nodeflow";
import { defaultPreset } from "nodeflow/presets";

const editor = new Editor(host, {
  preset: defaultPreset,
  document: doc,
  extensions: [myExtension],
  theme: { accent: "#a9a1ff" },
  snapToGrid: false, // default: free dragging; set a spacing such as 12 to snap
  touch: false, // optional; auto-detected otherwise
  onError: (message) => showError(message),
});
```

- `getSelection()` / `setSelection({ nodes?, connections?, groups? })`
- `getViewport()` / `setViewport({ x?, y?, scale? })`
- `toWorld(point)` / `toScreen(point)` / `zoomAt(screenPoint, scale)`
- `fitView(nodeIds?)` / `focusNode(id)` / `getNodeBounds(id)`
- `addNode(type)` / `deleteSelection()` / `duplicateSelection()` /
  `groupSelection()` / `createSubgraph()`
- `openGraph(graphId)` / `graphId` / `setSelectionMode(enabled)`
- `getLayoutInput()` / `setRuntimeState(nodeResults, instancePath?)`
- `use(extension)` / `executeCommand(id)` / `on(event => ...)`
- `metrics` (`frames`, `lastRenderDuration`, `nodeCount`) / `render()` /
  `destroy()`

Selection and viewport are not serialized. `setSelection` replaces selection;
omitted categories become empty. Document edits rebuild shared geometry once.
Dragging previews positions without changing document state. A spatial index
culls nodes and connections and narrows hit testing. Rendering is invalidated by
changes, not a continuous idle loop. Text caret blinking is the only editing
timer. Far overview scale draws topology and node bodies without unreadable
control details. `destroy()` is idempotent and releases document subscriptions,
DOM/window handlers, native input, timers, animation frames, and observers.

Node and group dragging follow the pointer freely by default. Set `snapToGrid`
to a spacing in world pixels to opt into snapping; hold Alt to bypass it.
Multi-node drags preserve relative spacing. Releasing commits the release
position as one undoable edit, even if the browser has not delivered the final
movement event.

`on()` emits selection, viewport, graph, error, and render events and returns an
unsubscribe function. The application owns graph breadcrumbs and side panels.
Graph controls, ports, menu items, and node navigation have semantic DOM
helpers; every visible graph pixel remains on Canvas.

### Controls and extensions

An `EditorExtension` can register `presentations`, custom `controls`, and
`commands`. Registration checks duplicates before installing entries. No plugin
loader or external dependency is required.

A `NodePresentation` has `type`, optional icon/color/width, controls, a summary
callback receiving data and runtime result, and an optional draw callback.
`portLayout: 'row'` puts controls below a horizontal port row; the default
reserves an input column. Controls may be a static list or a function of the
node.

Control definitions use `id`, `kind`, `label`, optional `key` (defaults to ID),
`disabled`, `validate`, and kind-specific settings. Built-ins are text,
textarea, number, toggle, slider, select, and button. Number/slider support
min/max/step. Select uses `{ label, value }[]`. Buttons receive
`{ document, graphId, nodeId }` in `action`.

Text sessions use native selection and composition, with canvas-rendered text,
caret, and selection. Enter commits a single-line value; Ctrl/⌘ Enter commits
multiline text. Escape cancels. Invalid values remain editable. Native text
clipboard commands do not invoke graph copy/delete shortcuts. The gallery
demonstrates all controls and an original rating control with `draw`, `pointer`,
`key`, and `accessibleValue` methods.

## Runtime

`new Runner(registry).register(type, executor, { trigger? })` registers
functions independently of visual presentations. Executors receive
`{ node, data, inputs, signal, path, triggerPayload, log }` and return an output
record or promise. Keys are output port IDs; a sink may also return values for
an application’s output panel.

`runner.run(snapshot, options?)` returns a handle immediately.
`runner.trigger(snapshot, nodeId, payload, options?)` explicitly activates a
registered trigger in the requested graph. Untriggered event sources and
required downstream branches skip execution. A runner allows one active run; use
separate instances for concurrency.

Options include `graphId`, graph `inputs`, `signal`, `timeoutMs` (30,000
default), and `maxExecutions` (10,000 default). Compilation validates the
reachable graph hierarchy, executors, required inputs, and topological order.
The timeout includes snapshot validation and compilation, with deadline and
abort checks between work units. A pre-aborted run returns a cancelled handle
without traversing the snapshot. Structural compilation errors still throw
synchronously. `maxExecutions` counts actual node invocations, not graph size.
Unconnected input configuration with a matching data key overrides the port
default. Connected values take priority. Connected optional inputs on skipped
branches are omitted. Executors own runtime value validation.

Each instance execution has a path such as `['instanceId', 'nestedNodeId']`.
`result.nodes` keys are `JSON.stringify(path)`; each entry also includes its
path. Shared predecessors execute once per graph invocation. Nested instances
execute their definitions independently. Ordering is deterministic,
single-flight, and sequential. Missing outputs and `SKIP` suppress downstream
required branches; `null` is a valid value.

A run handle exposes `id`, `result`, `events`, `subscribe`, and `cancel`. The
final result contains status, outputs, node statuses, duration, and optional
error. Node states are pending/running/completed/skipped/failed/cancelled.
Events also include application log messages. Configuration changes after a run
starts cannot affect its snapshot. Aborting an unresolved asynchronous executor
settles the handle promptly; executors should honor the signal to stop their own
external work. Synchronous JavaScript cannot be preempted. Errors fail the run
without retries.

## Layout

`layoutGraph(input, options?)` returns `{ positions, groups, bounds }`. Nodes
include ID, width, and height; edges include ID, source node ID, and target node
ID. Groups include IDs, immediate node IDs, and optional parent ID. Layout has
no dependency on editor or runtime code.

Options: `direction: 'right' | 'down'`, rank/node spacing, origin, and
AbortSignal. The algorithm condenses strongly connected components, lays out the
resulting DAG in ranks, applies deterministic crossing-reduction sweeps, sizes
each rank from measured geometry, and packs disconnected components and nested
group scopes. Cycles are arranged as components and remain cycles. It does not
change topology or guarantee an optimal crossing count.

`layoutGraphAsync()` yields between work units, including hierarchy
preprocessing. Both layout functions check a pre-aborted signal before reading
the input. For isolation and immediate cancellation, use
`layoutWithWorker(createWorker, input, options)`. Each call
owns its worker and terminates it on success, cancellation, or failure. The
published `nodeflow/layout-worker` module uses the exported request/response
protocol. Resolve that asset with your bundler and pass a factory returning a
module Worker. The Deno build emits the workbench worker beside its main script,
which starts it with
`new Worker(new URL('./layout-worker.js', import.meta.url), { type: 'module' })`.
Always guard revision and current graph before committing an asynchronous
result.

## Visual presets

`EditorOptions.preset` is required. The `nodeflow` entry owns graph interaction,
geometry, hit testing, accessibility, native inputs, culling, and scheduling. It
does not import a palette, material, icon set, or default painter. Visual modules
depend on the editor's public types; the editor never imports those modules.

- `nodeflow/presets` exports `defaultPreset`: glass nodes, clean connections and
  ports, controls, background, groups, selection overlays, and menus.
- `nodeflow/presets/unstyled` exports `unstyledPreset`: usable layout and hit
  dimensions, zero-duration motion, and an empty painter. It imports no default
  visual code. It produces a transparent canvas, including at overview zoom and
  when the graph is empty.

### Create your first preset

Use `createPreset(base, overrides)` to name and reuse your design. You only need
to supply the settings you want to change. This example keeps the default
painters, controls, menus, and interactions; no Canvas drawing is necessary.

```ts
// forest-preset.ts
import { createPreset } from "nodeflow";
import { defaultPreset } from "nodeflow/presets";

export const forestPreset = createPreset(defaultPreset, {
  theme: {
    accent: "#67d9b0",
    portColors: { number: "#67d9b0" },
  },
  nodes: {
    style: { radius: 18 },
    motion: { duration: 140 },
  },
  ports: { style: { radius: 6 } },
  connections: { style: { width: 2 } },
});
```

Pass the result to any editor using your existing host and graph document:

```ts
import { Editor } from "nodeflow";
import { forestPreset } from "./forest-preset.ts";

const editor = new Editor(host, { document: doc, preset: forestPreset });
```

You can extend `forestPreset` with another `createPreset()` call. To customize
only one editor, pass partial `theme`, `nodes`, `ports`, or `connections` options
directly to `Editor` instead; a new preset is useful when sharing those choices.

### How overrides combine

`createPreset` is exported from `nodeflow` and imports no visual defaults. Its
base is always explicit: choose `defaultPreset`, `unstyledPreset`, or your own
`EditorPreset`. Its second argument is typed as `EditorPresetOverrides`.

| Setting | Behavior |
| --- | --- |
| Theme and `portColors` | Merge by key, including node-local themes |
| Styles, motion, `touchStyle`, node-local `ports`, menu metrics | Merge nested fields; omitted fields inherit |
| Arrays such as `dash` and `pendingDash` | Replace the whole array; `[]` clears it |
| `draw`, `layout`, connection `geometry`, `createPainter` | Replace the callback; omitted callbacks inherit |
| `undefined` | Inherit the base value |
| `null` | Retained wherever supported, such as a port color inheriting its data-type color |

Configuration is copied and frozen, including nested settings and dash arrays.
Neither your base nor your overrides are modified or frozen. Functions are
reused; `createPainter` still runs once per editor, so each editor can own its
rendering resources. Appearance validation runs when the editor resolves these
settings, just as it does for directly supplied presets.

Touch styles apply over normal styles on touch devices. For a metric that your
base already changes on touch devices, set `touchStyle` too if you want the same
value there. To disable all built-in motion in a derived preset, set node
`duration` and `runningPeriod`, port `duration`, and connection `duration` and
`flowSpeed` to zero. Preset motion fields are partial objects; per-item appearance
overrides also accept `motion: false`.

### Replace one part of the drawing

You do not need to implement a complete painter to change one visual. Appearance
callbacks receive the resolved geometry, theme, and interaction state, plus
`drawDefault(parts)` to keep chosen parts of the base painter. For example, this
preset gives nodes a solid surface while retaining their headers, controls,
ports, and status indicators:

```ts
import { createPreset } from "nodeflow";
import { defaultPreset } from "nodeflow/presets";

export const solidPreset = createPreset(defaultPreset, {
  nodes: {
    draw({ context: ctx, geometry, style, theme, selected }, drawDefault) {
      const b = geometry.bounds;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.width, b.height, style.radius);
      ctx.fillStyle = theme.node;
      ctx.fill();
      ctx.lineWidth = selected ? style.selectionWidth : style.borderWidth;
      ctx.strokeStyle = selected ? theme.accent : theme.border;
      ctx.stroke();
      drawDefault(["header", "body", "ports", "status"]);
    },
  },
});
```

Use `ports.draw` or `connections.draw` the same way to replace those visuals.
Use `nodes.layout` or `connections.geometry` when changing the actual shape or
route so painting and hit testing agree. A drawing callback owns the states of
the parts it replaces; the example above handles node selection explicitly.
For a flat version of the shipped design without custom drawing, use
`nodes: { style: flatNodeStyle }` instead (`flatNodeStyle` comes from
`nodeflow/presets`).

### Build a completely custom painter

Start from `unstyledPreset` to keep usable layout and hit dimensions without
bringing in the default painter. This path requires Canvas knowledge. The
minimal example below draws a background, node surfaces, square ports, and
connections. Add text, controls, interaction states, groups, and overlays as
needed for your design.

```ts
import { createPreset, Editor } from "nodeflow";
import { unstyledPreset } from "nodeflow/presets/unstyled";

const customPreset = createPreset(unstyledPreset, {
  createPainter() {
    return {
      background({ context: ctx, width, height }) {
        ctx.fillStyle = "#f5f1e8";
        ctx.fillRect(0, 0, width, height);
      },
      node({ context: ctx, geometry }, part) {
        if (part !== "surface") return;
        const b = geometry.bounds;
        ctx.fillStyle = "#285a48";
        ctx.fillRect(b.x, b.y, b.width, b.height);
      },
      port({ context: ctx, point }) {
        ctx.fillStyle = "#cf724d";
        ctx.fillRect(point.x - 4, point.y - 4, 8, 8);
      },
      connection({ context: ctx, geometry }) {
        ctx.strokeStyle = "#285a48";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(geometry.source.x, geometry.source.y);
        ctx.bezierCurveTo(geometry.c1.x, geometry.c1.y,
          geometry.c2.x, geometry.c2.y, geometry.target.x, geometry.target.y);
        ctx.stroke();
      },
    };
  },
});

const editor = new Editor(host, { document: doc, preset: customPreset });
```

`createPainter` replaces the whole factory; its returned methods do not merge
with the base painter. Use appearance callbacks as shown above when you want
to keep individual parts of the base painter.

Omitted painter methods draw nothing. There is no fallback chrome, empty-state
message, menu drawing, glow, or animation. Add `group` and `overlay` methods if
your design needs them. Every callback runs with isolated Canvas state. The
factory runs once per editor and its optional `destroy()` releases owned
resources. Preset painters receive individual nodes, ports and connections at
every zoom. `connectionBatch` is an optional overview optimization; omit it for
individual connection painting. Node `ports` parts are dispatched by the editor
to the configured port painter, so node, port and connection modules compose.

Node painters receive presentation metadata, control state and custom control
painters, motion-aware `transition()` and `requestFrame()`, and a lazy
`getBackdrop()` for effects. A backdrop buffer is created only if a painter asks
for it. The default preset uses these same interfaces; it has no privileged
rendering path. `drawDefault()` in per-item overrides calls the selected preset's
painter. Geometry/layout overrides still govern painting, hit testing and inputs
together. Tokens such as `refraction` describe the shipped painter and have no
visual effect when your painter ignores them.

You can also author an `EditorPreset` object directly without `createPreset`.
That lower-level contract requires complete `theme`, `nodes`, `ports`,
`connections`, menu row metrics, and a `createPainter(context)` factory.
Appearance setters and per-item callbacks layer over the chosen preset; resolved
values are copied for each editor/item. Shipped presets and those created with
`createPreset` have frozen configuration.

Migration: add `preset: defaultPreset` to existing editor constructors and move
`darkTheme`, node/port/connection styles and motion imports from `nodeflow` to
`nodeflow/presets`. Replace `NodeStyle.portRadius` and `portWidth` with
`ports.style.radius` and `ports.style.width`; port label typography uses
`ports.style.labelSize`. Preset selection is per editor and is not serialized.

## Node appearance and motion

`defaultPreset` gives nodes refractive glass: a clear body, curved refracting rim,
directional highlights, soft shadow, colored icon well, recessed fields,
connected-port centers, and a status footer. Hover light, selection and drag
depth settle in 180 ms. Toggle thumbs animate; a visible running node has a
rotating status ring. Layout never moves during these transitions, so
connections and native text inputs stay aligned.

Appearance resolves in this order: `preset.nodes` → `EditorOptions.nodes` →
`NodePresentation.appearance` → `EditorOptions.nodeAppearance(node)`. Style,
node-local theme (including individual `portColors`), and motion fields merge.
Drawing and layout callbacks replace the previous callback. An instance resolver
runs when geometry rebuilds, not on each animation frame. It can derive a style
from node data without storing visual state in the document.

```ts
import { Editor } from "nodeflow";
import { defaultPreset, flatNodeStyle } from "nodeflow/presets";

const editor = new Editor(host, {
  preset: defaultPreset,
  document: doc,
  nodes: {
    style: {
      radius: 24,
      blur: 1,
      refraction: 8,
      refractionWidth: 16,
      opacity: 0.6,
    },
    motion: { duration: 140, runningPeriod: 1000 },
  },
  extensions: [{
    presentations: [{
      type: "scale",
      appearance: { theme: { accent: "hsl(170 60% 50%)" } },
      controls: [{ id: "factor", kind: "number", label: "Factor" }],
    }],
  }],
  nodeAppearance: (node) =>
    node.data.compact === true
      ? { style: { headerHeight: 44, radius: 8, footerHeight: 0 } }
      : undefined,
});

// Replace editor defaults live. Type/instance overrides continue to apply.
editor.setNodeAppearance({ style: flatNodeStyle, motion: false });
```

`setNodeAppearance()` returns `false` if invalid or composing text prevents the
current edit from closing. It preserves the edit and current appearance in that
case; otherwise it returns `true`. Invalid numeric style or motion settings
throw. Editor appearance is not serialized and does not create undo history.

`glassNodeStyle`, `flatNodeStyle`, and `defaultNodeMotion` are exported from `nodeflow/presets`.
`flatNodeStyle` disables translucency, blur, refraction, highlights, tint,
pointer light, shadow and selection glow; it still uses your theme colors.
`NodeStyle` exposes radii, border/selection widths, padding, header/footer
and control metrics, title/control/label typography, opacity, blur, refraction
strength/width, tint, highlights, lighting and shadow. All dimensions use world
pixels. Set effect opacities or widths to zero to remove them. The editor-level
`theme` affects the entire scene; an appearance's `theme` affects that node and
its controls/ports.

For larger type, adjust `fontSize`, `lineHeight`, `controlHeight`, and
optionally `labelHeight` together. `inputPadding`/`inputPaddingY` apply to both
canvas text and the native editing input. A control's explicit `height` takes
precedence over the default metrics. `getControlBounds(nodeId, controlId)` and
`getPortPosition(nodeId, portId)` return copies of the current world geometry,
alongside `getNodeBounds(nodeId)`.

### Replace any or all drawing

The `appearance.draw(view, drawDefault)` callback owns the node's pixels at
every zoom level. It receives the canvas context, shared geometry, resolved
style/theme, node, runtime result, selected/hovered/dragging flags, pointer
position and eased interaction progress. `detail` is `full`, `compact` or
`overview`. Coordinates are world coordinates; the editor applies viewport and
drag transforms.

```ts
import type { NodeAppearance } from "nodeflow";

const appearance: NodeAppearance = {
  draw(view, drawDefault) {
    const { context: ctx, geometry: { bounds: b }, theme } = view;
    ctx.fillStyle = view.selected ? theme.accent : theme.node;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.width, b.height, 2);
    ctx.fill();
    // Omit the built-in glass surface, keep the remaining parts.
    drawDefault(["header", "body", "ports", "status"]);
  },
};
```

Call `drawDefault()` for all parts, or omit it to replace the node entirely.
Each part and callback is isolated with canvas save/restore. `header` includes
icon, title, menu affordance and summary; `body` includes controls and the
existing `NodePresentation.draw` callback. Drawing hooks are synchronous. They
should not mutate the document or geometry. Semantic controls and input behavior
remain available when you replace painting; keep corresponding affordances
visible. `NodePresentation.drawIcon` replaces just the icon.
`ControlDefinition.draw` replaces one field's painting while retaining its label
and input behavior; custom-control renderers can also replace built-in control
kinds. Their optional fifth argument exposes focus, disabled state, live text
selection/scroll/validation, and caret visibility. The value argument reflects
text being edited before commit. Full node painters can read the same state with
`view.getControlState(controlId)`, including live slider previews.

For a different silhouette or arrangement, `appearance.layout(geometry, node)`
returns the final `NodeGeometry` (bounds, header, controls, ports, summary
position). The same result feeds drawing, hit testing, edge routing, native
inputs, fitting, and automatic layout measurements. Keep ports and controls
within the node bounds and maintain their IDs. No renderer fork is required.

### Motion, accessibility and cost

`motion: false` disables node animation; `duration: 0` snaps interaction state
and `runningPeriod: 0` keeps execution indicators static. Supply `easing(t)` to
change the interpolation. System `prefers-reduced-motion` takes priority over
all node settings and updates live. Hidden pages stop animated rendering;
offscreen nodes and overview rendering do not animate execution. Rendering stops
once visible transitions settle. Destroying the editor cancels the frame and
removes listeners and the backdrop buffer.

Glass uses only Canvas 2D. A shared backdrop buffer includes connections and
earlier nodes. Rounded edge bands sample displaced backdrop regions to
approximate a lens; `refraction` sets displacement and `refractionWidth` sets
the rim width. Set either to zero to disable lensing. Optional blur uses canvas
filters where supported; lensing also works without them. Compact/overview modes
omit these effects. This is a Canvas approximation inspired by Liquid Glass, not
Apple’s native material or a physical optical simulation. There are no shaders,
downloaded assets or runtime dependencies.

In the workbench, open **View & document → Node appearance** to compare liquid
glass, flat graphite and light paper. **Reduce node motion** disables animation
without changing the graph.

## Connections and ports

Ports are small, type-colored circles: hollow when available and filled when
connected. Hover and keyboard focus gently enlarge them. While connecting,
available compatible inputs receive a simple focus ring; incompatible or
occupied ports dim and turn red when targeted. The preview snaps to an eligible
port. Reconnection previews hide the original connection until committed or
canceled; the document remains unchanged until a valid connection is committed.

Connections use a single clean stroke with round caps. They scale with nodes
when zooming in; at far zoom their minimum thickness keeps the topology legible.
Hover and selection increase their weight. During execution, a short accent
travels from source to target along connections touching a running node. Idle
graphs do not animate. Pending, selected, hovered, connected and running states
are all available to custom painters. The node's glass material is independent
of these solid connection and port defaults.

```ts
import { Editor } from "nodeflow";
import { defaultPreset, defaultConnectionStyle, defaultPortStyle } from "nodeflow/presets";

const editor = new Editor(host, {
  preset: defaultPreset,
  document,
  ports: {
    style: { radius: 7, haloWidth: 5 },
    motion: { duration: 140 },
  },
  connections: {
    style: { width: 2.8, hoverWidth: 3.5 },
    motion: { duration: 180, flowSpeed: 100 },
  },
  portAppearance: (node, port) =>
    port.dataType === "event"
      ? { style: { color: "#e9ad70", coreRadius: 3 } }
      : undefined,
  connectionAppearance: (connection) =>
    connection.label === "Optional"
      ? { style: { dash: [5, 7], opacity: 0.6 } }
      : undefined,
});

editor.setPortAppearance({ style: defaultPortStyle, motion: false });
editor.setConnectionAppearance({
  style: defaultConnectionStyle,
  motion: false,
});
```

Port precedence is `preset.ports` → `EditorOptions.ports` → `preset.nodes.ports`
→ `nodes.ports` → `NodePresentation.appearance.ports` →
`nodeAppearance(node).ports` → `portAppearance(node, port)`. Port dimensions and
label typography are independent of node tokens. Use `ports.style.radius`,
`ports.style.width` and `ports.style.labelSize`; node-wide port overrides belong
in `nodes.ports`. Colors inherit the node's resolved theme. Connection precedence
is `preset.connections` → `connections` → `connectionAppearance(connection)`.
Connection colors inherit the editor theme. Overrides are presentation only,
never serialized and never added to undo history. The two setters replace editor
defaults and preserve per-item overrides.

`PortStyle` and `ConnectionStyle` expose dimensions, opacity, palette, labels,
focus rings, optional outlines, dashes and hit areas. Port `coreRadius: null`
fills the socket at any radius; set a number for a smaller center or zero to
keep it hollow. Connection `targetColor` optionally blends the stroke toward
another color. Colors accept Canvas CSS colors; `null` inherits the theme or
data type. Numeric effects accept zero to disable them. Exported
`defaultPortStyle`, `defaultConnectionStyle`, `defaultPortMotion` and
`defaultConnectionMotion` from `nodeflow/presets` can be composed into your presets. Glass highlights,
glossy rims and glass presets have been removed from the connection and port
API.

Each `draw(view, drawDefault)` callback can completely replace the built-in
painter, or retain selected parts. Port parts are `halo`, `socket`, `core`,
`indicator`, `label`; connection parts are `outline`, `line`, `flow`, `label`.
Canvas state is isolated between items and between default parts. Custom
painters run at every zoom and receive `detail` (`full`, `compact`, `overview`)
to choose their own level of detail. A node painter still owns its entire node:
include `drawDefault(["ports"])` to invoke the configured port painters.

```ts
const ports: PortAppearance = {
  draw(view, defaults) {
    defaults(["halo", "label"]);
    const { context: ctx, point: p, style, color } = view;
    ctx.fillStyle = color;
    const r = style.radius;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r);
    ctx.lineTo(p.x + r, p.y);
    ctx.lineTo(p.x, p.y + r);
    ctx.lineTo(p.x - r, p.y);
    ctx.closePath();
    ctx.fill();
  },
};
```

`connections.geometry(curve, connection)` also overrides routing. It must return
finite `source`, `target`, `c1`, `c2`, `samples`, `bounds`, and the original
`id`. The default painter uses the cubic control points; hit testing uses your
samples and spatial culling uses your bounds. Supply a custom painter too for
non-cubic paths. This hook runs for committed edges and while endpoints are
dragged. It receives `null` for the live preview, which uses editor-level
connection defaults. `ConnectionDrawContext.connection` is likewise null for
previews.

Motion can be overridden per item with `motion: false`; `duration: 0` makes
interaction changes immediate, and `flowSpeed: 0` freezes execution accents.
System reduced-motion preferences take priority and update live. Flow animation
stops when disabled, at compact/overview zoom, offscreen, or while the document
is hidden. Custom painters receive eased progress and a motion-aware
`flowOffset`; use these instead of starting your own animation loop. Default
overview connections remain batched for large graphs, omitting outlines,
execution accents and labels. Custom painters are responsible for their own
rendering cost.

In the workbench, **View & document → Connections & ports** switches between
Clean and High contrast. **Reduce connection & port motion** turns off their
animation independently of node motion.
