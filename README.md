# Nodeflow

A zero-dependency canvas graph editor for the web. Framework independent,
written in TypeScript, with a headless document model, optional execution
runner, and first-party automatic layout.

**Version 2 is a fresh API and document format.** Version 1 documents and
integrations need an explicit migration; there is no compatibility adapter.

## Try the workbench

```sh
deno task dev
```

Use **Deno 2.9.7 or newer**. Open the local URL printed by the server (by
default `http://127.0.0.1:5174/examples/workbench/`). Source edits rebuild the
workbench and reload connected browsers. The workbench includes a data pipeline,
event-driven automation, diagrams, visual programming, a control gallery, and a
1,000-node / 2,000-connection graph. Each example saves locally under its own
`nodeflow:v2:workbench:*` key. Version 1 storage is untouched.

The dev task uses `deno serve --watch`: Deno restarts on source, HTML, CSS, and
server-module changes. Each restart builds the browser JavaScript and worker
before serving; connected pages reload when the new build is ready. To customize
Deno's server flags, run the entry directly, with flags before the script path:

```sh
deno serve --host=127.0.0.1 --port=5179 --watch=src,examples/workbench \
  --allow-read --allow-write=dist-demo --allow-run=deno scripts/dev.ts
```

To serve a built workbench without watching or browser reload:

```sh
deno task build:examples
deno task preview
```

`deno task dev --port ...` is no longer supported: task arguments follow the
script path and are not Deno CLI options.

## Install

```sh
npm install nodeflow
```

No runtime, peer, optional, bundled, or transitive dependencies. No CDN scripts,
externally hosted fonts, framework adapters, or third-party layout code.
Development tooling is managed separately by Deno and is never shipped in the
runtime package. Both ESM and CommonJS exports include TypeScript declarations.

| Import                   | Purpose                                                                 | Needs a browser?       |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------- |
| `nodeflow/core`          | Registry, immutable documents, commands, history, validation, fragments | No                     |
| `nodeflow`               | Canvas editor, controls, extensions; re-exports core            | To construct an editor |
| `nodeflow/presets`       | Opt-in glass nodes, clean links, palette, painters and motion | To render |
| `nodeflow/presets/unstyled` | No drawing or animation; starting point for custom presets | No |
| `nodeflow/runtime`       | Async finite graph execution, events, cancellation                      | No                     |
| `nodeflow/layout`        | Deterministic layout, async scheduling, worker client                   | No                     |
| `nodeflow/layout-worker` | First-party module worker asset                                         | Worker host            |

## Create an editor

```ts
import { Editor } from "nodeflow";
import { defaultPreset } from "nodeflow/presets";
import { GraphDocument, NodeRegistry } from "nodeflow/core";

const registry = new NodeRegistry().register({
  type: "number",
  title: "Number",
  defaults: { value: 12 },
  ports: [{ id: "value", direction: "output", dataType: "number" }],
});
const graph = new GraphDocument(registry);
graph.addNode({ type: "number", position: { x: 100, y: 100 } });

const host = document.querySelector<HTMLElement>("#graph")!;
// The host must have a nonzero width and height.
host.style.height = "600px";
const editor = new Editor(host, {
  preset: defaultPreset,
  document: graph,
  extensions: [
    {
      presentations: [
        {
          type: "number",
          icon: "number",
          controls: [{ id: "value", kind: "number", label: "Value" }],
        },
      ],
    },
  ],
});
editor.fitView();

// On unmount:
// editor.destroy();
```

A preset is required explicitly. The base editor never imports a visual preset;
`defaultPreset` supplies the polished look. Create a reusable variation with
partial overrides—no nested object spreads or Canvas code required:

```ts
import { createPreset } from "nodeflow";
import { defaultPreset } from "nodeflow/presets";

const myPreset = createPreset(defaultPreset, {
  theme: { accent: "#67d9b0" },
  nodes: { style: { radius: 18 }, motion: { duration: 140 } },
  ports: { style: { radius: 6 } },
});
// Pass preset: myPreset to Editor.
```

For custom rendering, start from `unstyledPreset` in
`nodeflow/presets/unstyled` and provide your own painters. The
[preset authoring guide](docs/README.md#visual-presets) walks through styling,
replacing individual drawing parts, and building a completely custom painter.

All visible graph content is drawn on Canvas, including controls and menus. A
temporary transparent native input handles text selection, clipboard operations,
composition, and the on-screen keyboard. A semantic DOM companion provides
keyboard access to nodes, controls, and connection endpoints. Application chrome
is ordinary HTML.

Nodes ship with a refractive glass appearance and restrained
interaction/execution animation. Themes, dimensions, typography, motion, icons,
controls, layout and painting are overridable globally, by type, or per node.
Try **View & document → Node appearance** in the workbench, or see the
[appearance API](docs/README.md#node-appearance-and-motion).

## Run a graph

```ts
import { Runner } from "nodeflow/runtime";

const runner = new Runner(registry).register("number", ({ data }) => ({
  value: data.value,
}));
const run = runner.run(graph.snapshot());
const unsubscribe = run.subscribe((event) => console.log(event));
const result = await run.result;
unsubscribe();
// run.cancel() aborts an active run.
```

Execution uses a detached, validated document snapshot. Connections carry values
by port ID. A node runs once, after its predecessors; missing branch values skip
required downstream nodes. Return `SKIP` for a branch that should not run.
Cycles remain valid diagrams but are rejected by the runner. Runs support
asynchronous executors, explicit triggers, and nested subgraphs. There are no
retries, streaming, loops, persistent runtime state, or built-in backend
integrations.

## Arrange nodes

```ts
import { layoutGraphAsync } from "nodeflow/layout";

const revision = graph.revision;
const graphId = editor.graphId;
const layout = await layoutGraphAsync(editor.getLayoutInput());
if (graph.revision === revision && editor.graphId === graphId) {
  graph.transaction("Auto layout", () =>
    graph.dispatch({
      type: "move-nodes",
      graphId,
      positions: layout.positions,
    }));
  editor.fitView();
}
```

The internal layout engine handles node dimensions, disconnected components,
cycles, nested groups, and right/down directions. The workbench runs layout in a
worker. The ordinary layout entry also supports synchronous and cooperatively
scheduled operation.

## Editing

- Drag node headers to move. Shift-click or drag an area to select multiple
  nodes.
- Drag between ports, or click one port and then another. Drag a connected input
  to reconnect it. Escape cancels.
- Scroll to zoom at the pointer. Space-drag or middle-drag to pan. `F` fits the
  graph.
- `⌘/Ctrl Z` undoes; `⌘/Ctrl Shift Z` redoes. `⌘/Ctrl C/X/V` copies, cuts, and
  pastes graph fragments.
- `⌘/Ctrl D` duplicates; `⌘/Ctrl G` groups; `Delete` removes the selection.
- Tab reaches the node picker and selected node’s controls. Enter/Space
  activates controls. Arrow keys adjust sliders and custom controls.
- On touch screens, drag the background to pan, pinch to zoom, and long-press
  for a context menu. The workbench’s View panel switches to area selection.

[API and architecture](docs/README.md) ·
[Performance methodology](docs/performance.md)

## Development checks

```sh
deno task test                # native Deno tests; no DOM mocks
deno task coverage            # built-in coverage and HTML report
deno task check               # types, tests, build, offline npm package check
deno task build:examples      # production workbench + module worker
deno task test:browser:install
deno task test:browser        # Chromium, Firefox, WebKit, and two phone viewports
```

Deno supplies type checking, tests, coverage, bundling, and the local server.
`deno.json` and `deno.lock` own tooling configuration and dependency versions;
an npm install is unnecessary. The two development packages are TypeScript
(shared ESM/CommonJS declaration generation and consumer checks) and Playwright
(real browser tests). Deno’s bundler is experimental, so CI pins Deno 2.9.7.
[Deno bundling documentation](https://docs.deno.com/runtime/reference/bundling/).

Development tools use Deno's global cache with `"nodeModulesDir": "none"`; no
project `node_modules` directory is needed. Browser tests use explicit `npm:`
imports so Playwright's worker subprocesses can resolve their dependencies.
After migrating an existing checkout, the old `node_modules` directory can be
deleted.

Node.js 22 or 24 and npm are needed only for the offline npm consumer check and
publishing. Normal development, unit tests, builds, and browser tests run
through Deno. `package.json` remains the npm distribution manifest, with
convenience script aliases to Deno tasks. The npm consumer check installs into a
temporary directory and removes it afterward.

The package check installs the actual tarball offline into an empty consumer,
verifies the complete installed dependency tree, checks source/build imports,
and compiles ESM and CommonJS consumers. The core declaration entry is checked
without DOM typings.

Browser tests also verify idle rendering, invalidation coalescing, geometry, and
cleanup against real Canvas and DOM implementations. They cover editing and
validation, simulated IME composition, history, connections, graph clipboard,
nested graphs, worker layout, example execution, responsive panels, and
simulated pinch gestures. Physical mobile keyboards, native IME candidate
windows, and assistive-technology behavior require device testing; emulation is
not a substitute.

MIT licensed.
