import { defaultPreset, unstyledPreset } from "../../src/presets/index.ts";
import {
  createPreset,
  Editor,
  GraphDocument,
  NodeRegistry,
} from "../../src/index.ts";
import type { EditorOptions } from "../../src/index.ts";
import { TextInputBridge } from "../../src/editor/textInput.ts";

function fixture(options: Partial<Omit<EditorOptions, "document">> = {}) {
  const host = document.createElement("div");
  host.style.cssText = "width:800px;height:600px";
  document.body.append(host);
  const registry = new NodeRegistry().register({
    type: "value",
    title: "Value",
    ports: [{ id: "out", direction: "output", dataType: "number" }],
    defaults: { value: 1 },
  });
  const graph = new GraphDocument(registry);
  graph.addNode({ id: "a", type: "value" });
  const editor = new Editor(host, {
    preset: defaultPreset,
    document: graph,
    extensions: [{
      presentations: [{
        type: "value",
        controls: [{ id: "value", kind: "number", label: "Value" }],
      }],
    }],
    ...options,
  });
  return { editor, graph, host };
}
function network(options: Partial<Omit<EditorOptions, "document">> = {}) {
  const host = document.createElement("div");
  host.style.cssText = "width:800px;height:600px";
  document.body.append(host);
  const registry = new NodeRegistry()
    .register({
      type: "source",
      title: "Source",
      ports: [{ id: "out", direction: "output", dataType: "number" }],
    })
    .register({
      type: "sink",
      title: "Sink",
      ports: [{ id: "in", direction: "input", dataType: "number" }],
    })
    .register({
      type: "text",
      title: "Text",
      ports: [{ id: "in", direction: "input", dataType: "string" }],
    });
  const graph = new GraphDocument(registry);
  graph.addNode({ id: "a", type: "source", position: { x: 20, y: 50 } });
  graph.addNode({ id: "b", type: "sink", position: { x: 450, y: 50 } });
  graph.addNode({ id: "c", type: "text", position: { x: 20, y: 280 } });
  graph.addNode({ id: "d", type: "sink", position: { x: 450, y: 280 } });
  const edge = graph.connect({ nodeId: "a", portId: "out" }, {
    nodeId: "b",
    portId: "in",
  });
  const editor = new Editor(host, {
    preset: defaultPreset,
    document: graph,
    touch: false,
    ...options,
  });
  return { editor, graph, host, edge };
}
const api = {
  createPreset,
  defaultPreset,
  unstyledPreset,
  fixture,
  network,
  Editor,
  GraphDocument,
  NodeRegistry,
  TextInputBridge,
};
declare global {
  var nodeflowTest: typeof api;
  interface Window {
    nodeflowTest: typeof api;
  }
}
globalThis.nodeflowTest = api;
