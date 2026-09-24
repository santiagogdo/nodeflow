import { defaultPreset, flatNodeStyle } from "../../src/presets/index.ts";
import { Editor, GraphDocument } from "../../src/index.ts";
import type { NodeAppearance } from "../../src/index.ts";
import type { JsonValue, NodeData } from "../../src/core/index.ts";
import { layoutGraphAsync, layoutWithWorker } from "../../src/layout/index.ts";
import type {
  NodeResult,
  RunEvent,
  RunHandle,
  RunResult,
} from "../../src/runtime/index.ts";
import { createRegistry, createRunner, extension } from "./nodes.ts";
import { examples, seed } from "./fixtures.ts";
import type { ExampleId } from "./fixtures.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const registry = createRegistry();
const mobile = () => matchMedia("(max-width: 760px)").matches;
const iconPaths: Record<string, string> = {
  orders:
    '<ellipse cx="10" cy="4" rx="6" ry="2.5"/><path d="M4 4v11c0 4 12 4 12 0V4M4 10c0 4 12 4 12 0"/>',
  filter: '<path d="M3 4h14l-5 6v6l-4 2v-8z"/>',
  map:
    '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 7h6M7 10h6M7 13h4"/>',
  table:
    '<rect x="2" y="3" width="16" height="14" rx="2"/><path d="M2 8h16M8 8v9"/>',
  "@subgraph":
    '<rect x="2" y="2" width="6" height="6" rx="1"/><rect x="12" y="12" width="6" height="6" rx="1"/><path d="M5 8v7h7M8 5h7v7"/>',
  trigger: '<path d="m11 1-8 11h6l-1 7 9-12h-6z"/>',
  number: '<path d="M7 2 5 18M14 2l-2 16M2 7h16M1 13h16"/>',
};
const icon = (type: string) =>
  `<svg viewBox="0 0 20 20" aria-hidden="true">${
    iconPaths[type] ?? iconPaths.map
  }</svg>`;
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}
let graphDocument: GraphDocument;
let editor: Editor;
let current: ExampleId = "pipeline";
let runner = createRunner(registry);
let activeRun: RunHandle | null = null;
let runEpoch = 0;
let result: RunResult | null = null;
let logs: RunEvent[] = [];
let problems: string[] = [];
let outputTab = "output";
let docCleanup: (() => void) | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let layoutAbort: AbortController | null = null;
let navigation: { graphId: string; path: string[] }[] = [];
let observedGraph = "";
let previousSelection: string[] = [];
let selectionMode = false;
let nodeLook = "glass";
let reducedNodeMotion = false;
let linkLook = "clean";
let reducedLinkMotion = false;
function connectionAppearance() {
  return {
    style: linkLook === "contrast"
      ? {
        color: "#ffd580",
        width: 3.5,
        hoverWidth: 4,
        selectedWidth: 4.5,
        opacity: 1,
        outlineWidth: 3,
      }
      : {},
    motion: reducedLinkMotion ? false as const : {},
  };
}
function portAppearance() {
  return {
    style: linkLook === "contrast"
      ? {
        color: "#ffd580",
        radius: 7,
        width: 2,
      }
      : {},
    motion: reducedLinkMotion ? false as const : {},
  };
}
function nodeAppearance(): NodeAppearance {
  return {
    ...(nodeLook === "glass" ? {} : { style: flatNodeStyle }),
    ...(nodeLook === "paper"
      ? {
        theme: {
          node: "#f4f1eb",
          surface: "#e7e2d9",
          input: "#ffffff",
          border: "#9c978f",
          text: "#252932",
          muted: "#5b626b",
          accent: "#6251bd",
          success: "#24744c",
          danger: "#b02f42",
          portColors: { any: "#596776", records: "#3569ae" },
        },
      }
      : {}),
    motion: reducedNodeMotion ? false : {},
  };
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const initialId = new URL(location.href).searchParams.get("example");
const storageKey = (id: ExampleId) => `nodeflow:v2:workbench:${id}`;
function toast(message: string) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 5500);
}
function problem(message: string) {
  problems.push(message);
  $("problem-count").textContent = String(problems.length);
  toast(message);
  if (outputTab === "problems") renderOutput();
}
function resetRunState(reason: string) {
  runEpoch++;
  activeRun?.cancel(reason);
  activeRun = null;
  result = null;
  logs = [];
  problems = [];
  editor?.setRuntimeState({});
  $("problem-count").textContent = "";
  $("run-status").textContent = "Ready to run";
  $("run-status").className = "run-status";
  $("run").innerHTML = '<span aria-hidden="true">▷</span> Run';
}
function safely(action: () => void) {
  try {
    action();
  } catch (error) {
    problem(error instanceof Error ? error.message : String(error));
  }
}
function closePanels() {
  for (const id of ["library", "inspector", "view"]) {
    $(id).classList.remove("open");
  }
}
function showPanel(id: string) {
  if (id === "output") {
    closePanels();
    $("app").classList.toggle("output-hidden");
  } else {
    const open = !$(id).classList.contains("open");
    closePanels();
    $(id).classList.toggle("open", open);
  }
  document
    .querySelectorAll<HTMLButtonElement>("[data-panel]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.panel === id)
    );
}
function updateChrome() {
  const graph = graphDocument.snapshot().graphs[editor.graphId];
  $("graph-count").textContent = `${
    Object.keys(graph.nodes).length.toLocaleString()
  } nodes, ${
    Object.keys(graph.connections).length.toLocaleString()
  } connections`;
  $("graph-title").setAttribute("title", graph.label);
  if (document.activeElement !== $("graph-title")) {
    $<HTMLInputElement>("graph-title").value = graph.label;
  }
  document.title = `Nodeflow — ${graph.label}`;
  $<HTMLButtonElement>("undo").disabled = !graphDocument.canUndo;
  $<HTMLButtonElement>("redo").disabled = !graphDocument.canRedo;
  $("back").hidden = editor.graphId === graphDocument.snapshot().rootGraphId;
  $("zoom").textContent = `${Math.round(editor.getViewport().scale * 100)}%`;
}
function addReusable(id?: string) {
  const definitions = Object.values(graphDocument.snapshot().graphs).filter(
    (graph) =>
      graph.id !== graphDocument.snapshot().rootGraphId &&
      graph.id !== editor.graphId,
  );
  const definition = definitions.find((graph) => graph.id === id) ??
    definitions[0];
  if (!definition) {
    toast(
      "Select nodes, then choose “Create subgraph” in Selection to create a reusable graph.",
    );
    return;
  }
  const point = editor.toWorld({
    x: $("graph").clientWidth / 2,
    y: $("graph").clientHeight / 2,
  });
  const nodeId = graphDocument.addNode(
    {
      type: "@subgraph",
      label: definition.label,
      subgraphId: definition.id,
      position: point,
    },
    editor.graphId,
  );
  editor.focusNode(nodeId);
  closePanels();
}
function renderLibrary() {
  const query = $<HTMLInputElement>("node-search").value.toLowerCase(),
    metadata = examples.find((example) => example.id === current)!;
  const library = $("library-items");
  library.replaceChildren();
  let category = "";
  for (const type of metadata.types) {
    const definition = type === "@subgraph"
      ? { title: "Subgraph", category: "Transform" }
      : registry.get(type);
    if (!definition.title.toLowerCase().includes(query)) continue;
    if (category !== definition.category) {
      category = definition.category ?? "Nodes";
      library.append(element("div", category, "category"));
    }
    const button = element("button", undefined, "node-item");
    button.dataset.type = type;
    const glyph = element("span", undefined, "node-icon");
    glyph.innerHTML = icon(type);
    button.append(
      glyph,
      element("span", definition.title),
      element("span", "+", "add-mark"),
    );
    button.addEventListener("click", () =>
      safely(() => {
        if (type === "@subgraph") addReusable();
        else {
          const id = editor.addNode(type);
          editor.focusNode(id);
          closePanels();
        }
      }));
    library.append(button);
  }
  const reusable = Object.values(graphDocument.snapshot().graphs).filter(
    (graph) =>
      graph.id !== graphDocument.snapshot().rootGraphId &&
      graph.id !== editor.graphId &&
      graph.label.toLowerCase().includes(query),
  );
  if (reusable.length) {
    library.append(element("div", "Your subgraphs", "category"));
    for (const graph of reusable) {
      const button = element("button", graph.label, "node-item");
      button.addEventListener(
        "click",
        () => safely(() => addReusable(graph.id)),
      );
      library.append(button);
    }
  }
  if (!library.childElementCount) {
    library.append(element("p", "No matching nodes."));
  }
}
function actionButton(label: string, action: () => void, className?: string) {
  const button = element("button", label, className);
  button.addEventListener("click", () => safely(action));
  return button;
}
function renderInspector() {
  const selection = editor.getSelection(),
    graph = graphDocument.snapshot().graphs[editor.graphId],
    details = $("selection-details");
  // Preserve a metadata field while it is being edited.
  if (
    details.contains(document.activeElement) &&
    document.activeElement instanceof HTMLInputElement
  ) {
    return;
  }
  details.replaceChildren();
  const node = graph.nodes[selection.nodes[0]];
  const labelField = (label: string, onChange: (value: string) => void) => {
    const field = element("label", undefined, "field");
    field.append(element("span", "Label", "field-label"));
    const input = element("input");
    input.value = label;
    input.addEventListener("change", () => safely(() => onChange(input.value)));
    input.addEventListener("blur", () => setTimeout(renderInspector, 0));
    field.append(input);
    details.append(field);
  };
  if (selection.nodes.length === 1 && node) {
    details.append(element("h3", node.label));
    labelField(node.label, (label) =>
      graphDocument.dispatch({
        type: "update-node",
        graphId: editor.graphId,
        nodeId: node.id,
        changes: { label },
      }));
    const ports = registry.ports(node, graph, graphDocument.snapshot());
    if (ports.length) {
      details.append(element("div", "Ports", "section-title"));
      for (const port of ports) {
        const row = element("div", undefined, "port-schema"),
          name = element("span");
        name.append(
          element("i", undefined, "port-dot"),
          document.createTextNode(port.label ?? port.id),
        );
        row.append(
          name,
          element(
            "small",
            `${port.direction === "input" ? "in" : "out"} · ${port.dataType}`,
          ),
        );
        details.append(row);
      }
    }
    details.append(
      element("div", "Description", "section-title"),
      element(
        "p",
        node.type === "@subgraph"
          ? "A reusable graph. Changes to its definition update every instance."
          : node.type.startsWith("@")
          ? "A connection to this graph’s public interface."
          : (registry.get(node.type).description ??
            examples.find((example) => example.id === current)!.description),
      ),
    );
    const actions = element("div", undefined, "selection-actions");
    if (node.subgraphId) {
      actions.append(
        actionButton("Open graph", () => {
          editor.openGraph(node.subgraphId!);
          closePanels();
        }),
      );
    }
    actions.append(
      actionButton("Duplicate", () => editor.duplicateSelection()),
      actionButton("Delete", () => editor.deleteSelection(), "danger"),
    );
    details.append(actions);
  } else if (selection.groups.length === 1 && !selection.nodes.length) {
    const group = graph.groups[selection.groups[0]];
    details.append(element("h3", group.label));
    labelField(group.label, (label) =>
      graphDocument.dispatch({
        type: "update-group",
        graphId: editor.graphId,
        groupId: group.id,
        changes: { label },
      }));
    details.append(
      element("p", `${group.nodeIds.length} nodes in this group.`),
    );
    const actions = element("div", undefined, "selection-actions");
    actions.append(
      actionButton("Ungroup", () =>
        graphDocument.dispatch({
          type: "ungroup",
          graphId: editor.graphId,
          groupId: group.id,
        })),
      actionButton("Create subgraph", () => editor.createSubgraph()),
    );
    details.append(actions);
  } else if (selection.nodes.length > 1) {
    details.append(
      element("h3", `${selection.nodes.length} nodes selected`),
      element("p", "Move, group, or reuse these nodes together."),
    );
    const actions = element("div", undefined, "selection-actions");
    actions.append(
      actionButton("Group nodes", () => editor.groupSelection()),
      actionButton("Create subgraph", () => editor.createSubgraph()),
      actionButton("Duplicate", () => editor.duplicateSelection()),
      actionButton("Delete", () => editor.deleteSelection(), "danger"),
    );
    details.append(actions);
  } else if (selection.connections.length) {
    details.append(
      element("h3", "Connection"),
      element("p", "Right-click a connection to reconnect either end."),
    );
    const actions = element("div", undefined, "selection-actions");
    actions.append(
      actionButton(
        "Delete connection",
        () => editor.deleteSelection(),
        "danger",
      ),
    );
    details.append(actions);
  } else {
    details.append(
      element("h3", "Make a connection"),
      element(
        "p",
        examples.find((example) => example.id === current)!.description,
      ),
      element("div", "Getting around", "section-title"),
      element(
        "p",
        "Select a node to inspect it. Drag its header to move it. Drag between ports, or click one port and then another.",
      ),
    );
    const actions = element("div", undefined, "selection-actions");
    actions.append(
      actionButton(
        "Select all",
        () => editor.setSelection({ nodes: Object.keys(graph.nodes) }),
      ),
      actionButton("Fit graph", () => editor.fitView()),
    );
    details.append(actions);
  }
}
function renderOutput() {
  const content = $("output-content");
  content.replaceChildren();
  if (outputTab === "problems") {
    if (!problems.length) {
      content.append(
        element("div", "No problems. You’re all set.", "empty-output"),
      );
    } else {for (const message of problems) {
        content.append(element("p", message));
      }}
    return;
  }
  if (outputTab === "log") {
    if (!logs.length) {
      content.append(
        element(
          "div",
          "Run the graph to see what happens at each step.",
          "empty-output",
        ),
      );
    }
    for (const event of logs) {
      if (event.status === "pending") continue;
      const row = element("div", undefined, "log-row");
      row.append(
        element("time", `${event.time.toFixed(0)} ms`),
        element(
          "span",
          event.message ??
            `${event.path.join(" / ") || "Run"} · ${event.status}`,
          event.status,
        ),
      );
      content.append(row);
    }
    return;
  }
  if (current === "benchmark") {
    content.append(
      element(
        "div",
        "Pan and zoom to explore. Open View (⋯) → Measure rendering for a reproducible frame sample.",
        "empty-output",
      ),
    );
    return;
  }
  if (!result) {
    const empty = element("div", undefined, "empty-output");
    empty.append(
      element("span", "▷", "empty-icon"),
      element(
        "span",
        current === "diagrams"
          ? "This diagram includes a feedback loop. Edit, group, and arrange it freely."
          : "Run your graph to see its output here.",
      ),
    );
    content.append(empty);
    return;
  }
  if (result.status !== "completed") {
    content.append(element("p", result.error ?? result.status));
    return;
  }
  const completed = Object.values(result.nodes).filter(
    (node) => node.status === "completed",
  );
  const tableResult = completed.find((node) =>
    Array.isArray(node.outputs.rows)
  );
  if (tableResult) {
    const rows = tableResult.outputs.rows as Record<string, unknown>[];
    if (!rows.length) {
      content.append(
        element(
          "div",
          "No matching records. Try a different filter.",
          "empty-output",
        ),
      );
      return;
    }
    const table = element("table", undefined, "data-table"),
      head = element("thead"),
      body = element("tbody"),
      headings = element("tr");
    const keys = Object.keys(rows[0]);
    keys.forEach((key) => headings.append(element("th", key)));
    head.append(headings);
    rows.slice(0, 100).forEach((row) => {
      const tr = element("tr");
      keys.forEach((key) => tr.append(element("td", String(row[key] ?? ""))));
      body.append(tr);
    });
    table.append(head, body);
    content.append(table);
  } else if (current === "programming") {
    const value = completed.find((node) => node.path.at(-1) === "result")
      ?.outputs.value;
    content.append(element("div", String(value ?? "No value"), "result-value"));
  } else if (current === "automation") {
    const messages = completed.filter((node) => node.outputs.message);
    content.append(
      element(
        "div",
        messages.map((node) => String(node.outputs.message)).join(" · ") ||
          "No messages produced.",
        "empty-output",
      ),
    );
  } else {
    content.append(
      element(
        "pre",
        JSON.stringify(completed.at(-1)?.outputs ?? result.outputs, null, 2),
      ),
    );
  }
}
async function runGraph() {
  if (activeRun) {
    activeRun.cancel();
    return;
  }
  problems = [];
  logs = [];
  result = null;
  $("problem-count").textContent = "";
  const documentAtStart = graphDocument,
    revision = graphDocument.revision,
    epoch = ++runEpoch;
  try {
    const snapshot = graphDocument.snapshot();
    const handle = current === "automation"
      ? runner.trigger(snapshot, "trigger", { source: "Run button" })
      : runner.run(snapshot);
    activeRun = handle;
    $("run").textContent = "□ Stop";
    $("run-status").textContent = "Running…";
    $("run-status").className = "run-status";
    const states: Record<string, NodeResult> = {};
    handle.subscribe((event) => {
      if (graphDocument !== documentAtStart || runEpoch !== epoch) return;
      logs.push(event);
      if (event.type === "node") {
        states[JSON.stringify(event.path)] = {
          path: [...event.path],
          status: event.status,
          outputs: event.outputs ?? {},
        };
        editor.setRuntimeState(states, navigation.at(-1)?.path ?? []);
      }
      if (outputTab === "log") renderOutput();
    });
    const completed = await handle.result;
    if (graphDocument !== documentAtStart || runEpoch !== epoch) return;
    result = completed;
    editor.setRuntimeState(result.nodes, navigation.at(-1)?.path ?? []);
    $("run-status").className = `run-status ${result.status}`;
    $("run-status").textContent = revision === graphDocument.revision
      ? result.status[0].toUpperCase() + result.status.slice(1)
      : "Edited · Run again";
    if (result.error) problem(result.error);
    renderOutput();
  } catch (error) {
    if (graphDocument !== documentAtStart || runEpoch !== epoch) return;
    problem(error instanceof Error ? error.message : String(error));
    $("run-status").textContent = "Could not run";
    $("run-status").className = "run-status failed";
    renderOutput();
  } finally {
    if (graphDocument === documentAtStart && runEpoch === epoch) {
      activeRun = null;
      $("run").innerHTML = '<span aria-hidden="true">▷</span> Run';
    }
  }
}
async function arrange() {
  if (layoutAbort) {
    layoutAbort.abort();
    return;
  }
  const controller = new AbortController();
  layoutAbort = controller;
  const documentAtStart = graphDocument,
    revision = graphDocument.revision,
    graphId = editor.graphId;
  $("layout").innerHTML = '<span aria-hidden="true">×</span> Cancel layout';
  try {
    const input = editor.getLayoutInput();
    const arranged = typeof Worker === "undefined"
      ? await layoutGraphAsync(input, { signal: controller.signal })
      : await layoutWithWorker(
        () =>
          new Worker(
            new URL("./layout-worker.js", import.meta.url),
            { type: "module" },
          ),
        input,
        { signal: controller.signal },
      );
    if (
      documentAtStart !== graphDocument ||
      revision !== graphDocument.revision ||
      graphId !== editor.graphId
    ) {
      toast("The graph changed while arranging. Run Auto layout again.");
      return;
    }
    graphDocument.transaction("Auto layout", () =>
      graphDocument.dispatch({
        type: "move-nodes",
        graphId,
        positions: arranged.positions,
      }));
    editor.fitView();
  } catch (error) {
    if (!controller.signal.aborted) {
      problem(error instanceof Error ? error.message : String(error));
    }
  } finally {
    if (layoutAbort === controller) {
      layoutAbort = null;
      $("layout").innerHTML = '<span aria-hidden="true">⊞</span> Auto layout';
    }
  }
}
function saveNow() {
  if (!graphDocument) return;
  try {
    localStorage.setItem(storageKey(current), graphDocument.serialize());
    $("save-state").textContent = "Saved locally";
  } catch {
    $("save-state").textContent = "Local storage unavailable";
  }
}
function loadExample(id: ExampleId, reset = false) {
  clearTimeout(saveTimer);
  if (graphDocument) saveNow();
  resetRunState("Example changed");
  layoutAbort?.abort();
  docCleanup?.();
  editor?.destroy();
  current = id;
  navigation = [];
  previousSelection = [];
  runner = createRunner(registry);
  const initial = seed(id, registry, mobile());
  let saved: string | null = null;
  try {
    saved = reset ? null : localStorage.getItem(storageKey(id));
  } catch {
    /* The editor remains usable without storage. */
  }
  try {
    graphDocument = new GraphDocument(registry, {
      initialState: saved ?? initial,
    });
  } catch {
    graphDocument = new GraphDocument(registry, { initialState: initial });
    toast(
      "This example’s saved graph could not be loaded. Showing the original example.",
    );
  }
  editor = new Editor($("graph"), {
    preset: defaultPreset,
    document: graphDocument,
    extensions: [extension],
    nodes: nodeAppearance(),
    connections: connectionAppearance(),
    ports: portAppearance(),
    touch: mobile() || matchMedia("(pointer: coarse)").matches,
    onError: problem,
  });
  observedGraph = editor.graphId;
  editor.on((event) => {
    if (event.type === "selection" || event.type === "graph") {
      if (editor.graphId !== observedGraph) {
        const old = graphDocument.snapshot().graphs[observedGraph];
        const instance = old?.nodes[previousSelection[0]] ??
          Object.values(old?.nodes ?? {}).find(
            (node) => node.subgraphId === editor.graphId,
          );
        const found = navigation.findIndex(
          (entry) => entry.graphId === editor.graphId,
        );
        if (editor.graphId === graphDocument.snapshot().rootGraphId) {
          navigation = [];
        } else if (found >= 0) navigation = navigation.slice(0, found + 1);
        else {
          navigation.push({
            graphId: editor.graphId,
            path: [
              ...(navigation.at(-1)?.path ?? []),
              ...(instance ? [instance.id] : []),
            ],
          });
        }
        observedGraph = editor.graphId;
        renderLibrary();
        if (result) {
          editor.setRuntimeState(result.nodes, navigation.at(-1)?.path ?? []);
        }
      }
      previousSelection = editor.getSelection().nodes;
      renderInspector();
      updateChrome();
    } else if (event.type === "viewport") updateChrome();
  });
  docCleanup = graphDocument.subscribe(() => {
    clearTimeout(saveTimer);
    $("save-state").textContent = "Saving…";
    saveTimer = setTimeout(saveNow, 300);
    if (result) $("run-status").textContent = "Edited · Run again";
    updateChrome();
    renderLibrary();
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-example]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.example === id)
    );
  $<HTMLSelectElement>("example-select").value = id;
  $<HTMLInputElement>("node-search").value = "";
  const url = new URL(location.href);
  url.searchParams.set("example", id);
  history.replaceState(null, "", url);
  renderLibrary();
  renderInspector();
  renderOutput();
  updateChrome();
  closePanels();
  requestAnimationFrame(() => {
    if (current !== id) return;
    if (mobile() && id === "pipeline") {
      editor.focusNode("filter");
      const bounds = editor.getNodeBounds("filter");
      if (bounds) {
        editor.setViewport({
          y: Math.max(20, $("graph").clientHeight - bounds.height - 14) -
            bounds.y,
        });
      }
    } else if (id === "controls" && mobile()) editor.focusNode("gallery");
    else if (id === "benchmark") {
      editor.setViewport({ scale: 0.65, x: 40, y: 40 });
    } else editor.fitView();
    if (id === "pipeline") {
      editor.setSelection({ nodes: ["filter"] });
      void runGraph();
    }
  });
  if (reset) saveNow();
}
function exportGraph() {
  const blob = new Blob([graphDocument.serialize()], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = element("a");
  a.href = url;
  a.download = `nodeflow-${current}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function measureRendering() {
  if (current !== "benchmark") {
    toast("Open the large graph example first.");
    return;
  }
  closePanels();
  toast("Measuring 180 frames of panning…");
  const target = editor,
    initial = editor.getViewport(),
    samples: number[] = [],
    frames: number[] = [];
  let previous = performance.now();
  for (let i = 0; i < 180; i++) {
    if (target !== editor) return;
    await new Promise<void>((resolve) => {
      const unsubscribe = target.on((event) => {
        if (event.type === "render") {
          unsubscribe();
          resolve();
        }
      });
      target.setViewport({
        x: initial.x - i * 8,
        y: initial.y - Math.sin(i / 20) * 90,
      });
    });
    const now = performance.now();
    if (i > 10) {
      frames.push(now - previous);
      samples.push(target.metrics.lastRenderDuration);
    }
    previous = now;
  }
  target.setViewport(initial);
  samples.sort((a, b) => a - b);
  frames.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)],
    interval = frames[Math.floor(frames.length * 0.95)];
  const content = $("output-content");
  content.replaceChildren(
    element(
      "pre",
      `1,000 nodes · 2,000 connections\nRender p95: ${
        p95.toFixed(2)
      } ms\nFrame interval p95: ${
        interval.toFixed(2)
      } ms\n${samples.length} measured frames · DPR ${devicePixelRatio} · ${
        $("graph").clientWidth
      } × ${$("graph").clientHeight}\n${navigator.userAgent}`,
    ),
  );
  toast(`Render p95: ${p95.toFixed(2)} ms. Details in Output.`);
  $("app").classList.remove("output-hidden");
}
for (const example of examples) {
  if (
    ["pipeline", "automation", "diagrams", "programming"].includes(example.id)
  ) {
    const button = element("button", example.label);
    button.dataset.example = example.id;
    button.addEventListener("click", () => loadExample(example.id));
    $("example-tabs").append(button);
  }
  const option = element("option", example.label);
  option.value = example.id;
  $("example-select").append(option);
}
$<HTMLSelectElement>("example-select").addEventListener(
  "change",
  (event) =>
    loadExample((event.target as HTMLSelectElement).value as ExampleId),
);
$("node-search").addEventListener("input", renderLibrary);
$("run").addEventListener("click", () => {
  void runGraph();
});
$("layout").addEventListener("click", () => {
  void arrange();
});
$("undo").addEventListener("click", () => graphDocument.undo());
$("redo").addEventListener("click", () => graphDocument.redo());
$("fit").addEventListener("click", () => editor.fitView());
$("zoom").addEventListener("click", () =>
  editor.zoomAt(
    { x: $("graph").clientWidth / 2, y: $("graph").clientHeight / 2 },
    1,
  ));
$("group").addEventListener(
  "click",
  () => safely(() => editor.groupSelection()),
);
$("mobile-group").addEventListener("click", () =>
  safely(() => {
    editor.groupSelection();
    closePanels();
  }));
$("graph-title").addEventListener(
  "change",
  () =>
    safely(() =>
      graphDocument.dispatch({
        type: "rename-graph",
        graphId: editor.graphId,
        label: $<HTMLInputElement>("graph-title").value,
      })
    ),
);
$("back").addEventListener("click", () =>
  editor.openGraph(
    navigation.at(-2)?.graphId ?? graphDocument.snapshot().rootGraphId,
  ));
$("gallery-link").addEventListener("click", () => loadExample("controls"));
$("benchmark-link").addEventListener("click", () => loadExample("benchmark"));
for (const id of ["import", "mobile-import"]) {
  $(id).addEventListener(
    "click",
    () => $<HTMLInputElement>("file-input").click(),
  );
}
for (const id of ["export", "mobile-export"]) {
  $(id).addEventListener("click", exportGraph);
}
$("file-input").addEventListener("change", async () => {
  const file = $<HTMLInputElement>("file-input").files?.[0];
  if (!file) return;
  try {
    const target = graphDocument,
      text = await file.text();
    if (target !== graphDocument) return;
    graphDocument.load(text);
    resetRunState("Graph imported");
    layoutAbort?.abort();
    navigation = [];
    previousSelection = [];
    editor.openGraph(graphDocument.snapshot().rootGraphId);
    renderInspector();
    renderOutput();
    toast("Graph imported.");
  } catch (error) {
    problem(error instanceof Error ? error.message : String(error));
  }
  $<HTMLInputElement>("file-input").value = "";
});
for (
  const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-output]",
  )
) {
  button.addEventListener("click", () => {
    outputTab = button.dataset.output!;
    document
      .querySelectorAll("[data-output]")
      .forEach((tab) =>
        tab.setAttribute("aria-selected", String(tab === button))
      );
    document
      .querySelectorAll("[data-output]")
      .forEach((tab) => tab.removeAttribute("id"));
    button.id = "output-tab";
    renderOutput();
  });
}
for (
  const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-panel]",
  )
) {
  button.addEventListener("click", () => showPanel(button.dataset.panel!));
}
for (
  const button of document.querySelectorAll<HTMLButtonElement>(
    ".close-panel",
  )
) {
  button.addEventListener("click", closePanels);
}
$("zoom-in").addEventListener("click", () =>
  editor.zoomAt(
    { x: $("graph").clientWidth / 2, y: $("graph").clientHeight / 2 },
    editor.getViewport().scale * 1.25,
  ));
$("zoom-out").addEventListener("click", () =>
  editor.zoomAt(
    { x: $("graph").clientWidth / 2, y: $("graph").clientHeight / 2 },
    editor.getViewport().scale / 1.25,
  ));
$("node-appearance").addEventListener("change", () => {
  const previous = nodeLook;
  nodeLook = $<HTMLSelectElement>("node-appearance").value;
  if (!editor.setNodeAppearance(nodeAppearance())) {
    nodeLook = previous;
    $<HTMLSelectElement>("node-appearance").value = previous;
  }
});
$("node-motion").addEventListener("click", () => {
  reducedNodeMotion = !reducedNodeMotion;
  if (!editor.setNodeAppearance(nodeAppearance())) {
    reducedNodeMotion = !reducedNodeMotion;
  }
  $("node-motion").setAttribute("aria-pressed", String(reducedNodeMotion));
});
$("link-appearance").addEventListener("change", () => {
  linkLook = $<HTMLSelectElement>("link-appearance").value;
  editor.setConnectionAppearance(connectionAppearance());
  editor.setPortAppearance(portAppearance());
});
$("link-motion").addEventListener("click", () => {
  reducedLinkMotion = !reducedLinkMotion;
  editor.setConnectionAppearance(connectionAppearance());
  editor.setPortAppearance(portAppearance());
  $("link-motion").setAttribute("aria-pressed", String(reducedLinkMotion));
});
$("select-mode").addEventListener("click", () => {
  selectionMode = !selectionMode;
  editor.setSelectionMode(selectionMode);
  $("select-mode").setAttribute("aria-pressed", String(selectionMode));
  closePanels();
  toast(
    selectionMode
      ? "Drag an area to select nodes."
      : "Drag the background to pan.",
  );
});
$("reset").addEventListener("click", () => {
  loadExample(current, true);
  toast("Example reset.");
});
$("measure").addEventListener("click", () => {
  void measureRendering();
});
const viewMenu = actionButton(
  "⋯",
  () => showPanel("view"),
  "icon-button desktop-only",
);
viewMenu.setAttribute("aria-label", "View and document actions");
document.querySelector(".viewport-actions")!.append(viewMenu);
globalThis.addEventListener("pagehide", (event) => {
  saveNow();
  activeRun?.cancel();
  layoutAbort?.abort();
  if (!event.persisted) {
    docCleanup?.();
    editor.destroy();
  }
});
loadExample(
  examples.some((example) => example.id === initialId)
    ? (initialId as ExampleId)
    : "pipeline",
);
// The demo exposes its public integration objects for examples and browser regression tests.
Object.defineProperty(window, "nodeflowDemo", {
  value: {
    get editor() {
      return editor;
    },
    get document() {
      return graphDocument;
    },
    get result() {
      return result;
    },
    loadExample,
    runGraph,
    arrange,
    measureRendering,
  },
  configurable: true,
});
