import { emptyGraph, GraphDocument } from "../../src/core/index.ts";
import type {
  DocumentSnapshot,
  NewNode,
  NodeRegistry,
} from "../../src/core/index.ts";
export type ExampleId =
  | "pipeline"
  | "automation"
  | "diagrams"
  | "programming"
  | "controls"
  | "benchmark";
export const examples: {
  id: ExampleId;
  label: string;
  title: string;
  description: string;
  types: string[];
}[] = [
  {
    id: "pipeline",
    label: "Data pipeline",
    title: "Order processing",
    description: "Filter, transform, and inspect a local dataset.",
    types: ["orders", "filter", "map", "@subgraph", "table"],
  },
  {
    id: "automation",
    label: "Automation",
    title: "Order approval",
    description: "An explicit trigger, a branch, and an async step.",
    types: ["trigger", "condition", "delay", "message"],
  },
  {
    id: "diagrams",
    label: "Diagrams",
    title: "Release workflow",
    description: "General diagrams support cycles, grouping, and annotations.",
    types: ["step", "decision"],
  },
  {
    id: "programming",
    label: "Visual programming",
    title: "A little arithmetic",
    description: "Compose typed values and reusable calculations.",
    types: ["number", "math", "result", "@subgraph"],
  },
  {
    id: "controls",
    label: "Control gallery",
    title: "Made for interaction",
    description:
      "Text, numbers, toggles, sliders, menus, and a custom canvas control.",
    types: ["controls", "number"],
  },
  {
    id: "benchmark",
    label: "Large graph",
    title: "1,000 nodes · 2,000 connections",
    description:
      "Pan and zoom a reproducible large graph. Measure actual render time.",
    types: ["benchmark"],
  },
];
export function seed(
  id: ExampleId,
  registry: NodeRegistry,
  compact = false,
): DocumentSnapshot {
  if (id === "benchmark") {
    const graph = emptyGraph("root", "1,000 nodes · 2,000 connections");
    for (let i = 0; i < 1000; i++) {
      const key = `n${i}`;
      graph.nodes[key] = {
        id: key,
        type: "benchmark",
        label: `Node ${i + 1}`,
        data: {},
        position: { x: (i % 40) * 330, y: Math.floor(i / 40) * 180 },
      };
    }
    for (let i = 0; i < 2000; i++) {
      graph.connections[`e${i}`] = {
        id: `e${i}`,
        source: { nodeId: `n${i % 1000}`, portId: "out" },
        target: {
          nodeId: `n${((i % 1000) + (i < 1000 ? 1 : 41)) % 1000}`,
          portId: "in",
        },
      };
    }
    return { version: 2, rootGraphId: "root", graphs: { root: graph } };
  }
  const document = new GraphDocument(registry, {
    label: examples.find((item) => item.id === id)!.title,
  });
  const node = (
    id: string,
    type: string,
    x: number,
    y: number,
    extra: Partial<NewNode> = {},
  ) => document.addNode({ id, type, position: { x, y }, ...extra });
  const edge = (from: string, out: string, to: string, into: string) =>
    document.connect(
      { nodeId: from, portId: out },
      { nodeId: to, portId: into },
    );
  document.transaction("Create example", () => {
    if (id === "pipeline") {
      const transform = emptyGraph("transform", "Transform group");
      transform.inputs = [{ id: "rows", dataType: "records" }];
      transform.outputs = [
        { id: "result", label: "rows", dataType: "records" },
      ];
      transform.nodes = {
        input: {
          id: "input",
          type: "@input",
          label: "Rows in",
          data: { portId: "rows" },
          position: { x: 0, y: 0 },
        },
        output: {
          id: "output",
          type: "@output",
          label: "Rows out",
          data: { portId: "result" },
          position: { x: 340, y: 0 },
        },
      };
      transform.connections = {
        through: {
          id: "through",
          source: { nodeId: "input", portId: "value" },
          target: { nodeId: "output", portId: "value" },
        },
      };
      document.dispatch({ type: "add-graph", graph: transform });
      node("source", "orders", 0, 170);
      node("filter", "filter", 405, 0);
      node("map", "map", 398, 334);
      node("table", "table", 752, 55);
      node("transform", "@subgraph", 752, 335, {
        label: "Transform group",
        width: 248,
        subgraphId: "transform",
      });
      edge("source", "orders", "filter", "orders");
      edge("filter", "matches", "table", "rows");
      edge("source", "orders", "map", "rows");
      edge("map", "mapped", "transform", "rows");
    } else if (id === "automation") {
      node("trigger", "trigger", 0, 120);
      node("condition", "condition", 340, 110);
      node("delay", "delay", 680, 0);
      node("approved", "message", 1020, 0);
      node("rejected", "message", 680, 260, {
        label: "Rejected",
        data: { message: "Order needs review" },
      });
      edge("trigger", "event", "condition", "event");
      edge("condition", "yes", "delay", "event");
      edge("delay", "done", "approved", "event");
      edge("condition", "no", "rejected", "event");
    } else if (id === "diagrams") {
      node("design", "step", 0, 90, {
        label: "Design",
        data: { description: "Explore the problem" },
      });
      node("build", "step", 340, 90, {
        label: "Build",
        data: { description: "Make it work" },
      });
      node("review", "decision", 680, 90, { label: "Review" });
      node("ship", "step", 1040, 0, {
        label: "Ship",
        data: { description: "Share your work" },
      });
      edge("design", "out", "build", "in");
      edge("build", "out", "review", "in");
      edge("review", "yes", "ship", "in");
      edge("review", "no", "build", "in");
      document.dispatch({
        type: "add-group",
        group: {
          id: "iterate",
          label: "Iterate together",
          nodeIds: ["build", "review"],
        },
      });
    } else if (id === "programming") {
      node("number", "number", 0, 80);
      node("multiply", "math", 330, 0, { label: "Multiply by two" });
      node("add", "math", 660, 0, {
        label: "Add six",
        data: { operation: "add", b: 6 },
      });
      node("result", "result", 990, 70);
      edge("number", "value", "multiply", "a");
      edge("multiply", "value", "add", "a");
      edge("add", "value", "result", "value");
    } else {
      node("gallery", "controls", 0, 0);
      node("number", "number", 450, 100, { data: { value: 42 } });
    }
  });
  const snapshot = JSON.parse(document.serialize()) as DocumentSnapshot;
  if (compact && id === "pipeline") {
    const positions = {
      source: { x: -80, y: -200 },
      filter: { x: 0, y: 0 },
      table: { x: 340, y: 70 },
      map: { x: -80, y: 440 },
      transform: { x: 340, y: 440 },
    };
    for (const [nodeId, position] of Object.entries(positions)) {
      snapshot.graphs.root.nodes[nodeId].position = position;
    }
  }
  return snapshot;
}
