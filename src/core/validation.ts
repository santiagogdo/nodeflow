import { assertId, assertRecord, cloneJSONChecked } from "./json.ts";
import type { DocumentSnapshot, GraphPort } from "./types.ts";
import { createInterfacePortLookup, NodeRegistry } from "./registry.ts";

function ports(
  ports: readonly GraphPort[],
  label: string,
  checkpoint?: () => void,
) {
  if (!Array.isArray(ports)) throw new Error(`${label} must be an array`);
  const ids = new Set<string>();
  for (const port of ports) {
    checkpoint?.();
    assertRecord(port, "Port");
    assertId(port.id);
    if (ids.has(port.id)) throw new Error(`Duplicate port: ${port.id}`);
    ids.add(port.id);
    if (typeof port.dataType !== "string" || !port.dataType) {
      throw new Error("Ports need a data type");
    }
    for (const flag of ["multiple", "required"] as const) {
      if (port[flag] !== undefined && typeof port[flag] !== "boolean") {
        throw new Error(`Invalid port ${flag}`);
      }
    }
  }
}
export function validateDocument(
  input: unknown,
  registry: NodeRegistry,
): DocumentSnapshot {
  return validateDocumentChecked(input, registry);
}
/** Internal runner checkpoints also cover validation and detached JSON copying. */
export function validateDocumentChecked(
  input: unknown,
  registry: NodeRegistry,
  checkpoint?: () => void,
): DocumentSnapshot {
  const state = cloneJSONChecked(
    typeof input === "string" ? JSON.parse(input) : input,
    checkpoint,
  );
  assertRecord(state, "Document");
  if (state.version !== 2) {
    throw new Error(
      "Unsupported document version; expected Nodeflow version 2",
    );
  }
  assertId(state.rootGraphId);
  assertRecord(state.graphs, "Graphs");
  if (!Object.hasOwn(state.graphs, state.rootGraphId)) {
    throw new Error("Missing root graph");
  }
  const document = state as DocumentSnapshot;
  const interfacePort = createInterfacePortLookup(checkpoint);
  for (const [graphId, graph] of Object.entries(document.graphs)) {
    checkpoint?.();
    assertId(graphId);
    assertRecord(graph, "Graph");
    if (graph.id !== graphId || typeof graph.label !== "string") {
      throw new Error("Invalid graph identity");
    }
    assertRecord(graph.nodes, "Nodes");
    assertRecord(graph.connections, "Connections");
    assertRecord(graph.groups, "Groups");
    ports(graph.inputs, "Graph inputs", checkpoint);
    ports(graph.outputs, "Graph outputs", checkpoint);
    const used = new Set<string>();
    const claim = (id: string, key: string) => {
      assertId(id);
      if (id !== key || used.has(id)) {
        throw new Error(`Duplicate or invalid graph ID: ${id}`);
      }
      used.add(id);
    };
    for (const [key, node] of Object.entries(graph.nodes)) {
      checkpoint?.();
      assertRecord(node, "Node");
      claim(node.id, key);
      if (typeof node.label !== "string" || typeof node.type !== "string") {
        throw new Error("Invalid node label or type");
      }
      assertRecord(node.data, "Node data");
      assertRecord(node.position, "Position");
      if (![node.position.x, node.position.y].every(Number.isFinite)) {
        throw new Error("Positions must be finite");
      }
      if (
        node.width !== undefined &&
        (!Number.isFinite(node.width) || node.width < 120)
      ) {
        throw new Error("Node width must be at least 120");
      }
      if (!["@subgraph", "@input", "@output"].includes(node.type)) {
        registry.get(node.type).validate?.(node.data);
      }
      const nodePorts = registry.ports(node, graph, document, interfacePort);
      ports(nodePorts, "Node ports", checkpoint);
      for (const port of nodePorts) {
        checkpoint?.();
        if (!["input", "output"].includes(port.direction)) {
          throw new Error("Invalid port direction");
        }
        if (
          port.side !== undefined &&
          !["left", "right", "top", "bottom"].includes(port.side)
        ) {
          throw new Error("Invalid port side");
        }
      }
    }
    const pairs = new Set<string>(),
      targets = new Set<string>();
    for (const [key, connection] of Object.entries(graph.connections)) {
      checkpoint?.();
      assertRecord(connection, "Connection");
      claim(connection.id, key);
      assertRecord(connection.source, "Source");
      assertRecord(connection.target, "Target");
      for (const endpoint of [connection.source, connection.target]) {
        assertId(endpoint.nodeId);
        assertId(endpoint.portId);
      }
      const sourceNode = graph.nodes[connection.source.nodeId],
        targetNode = graph.nodes[connection.target.nodeId];
      if (!sourceNode || !targetNode) {
        throw new Error("Connection refers to a missing node");
      }
      const source = registry
        .ports(sourceNode, graph, document, interfacePort)
        .find((port) => port.id === connection.source.portId);
      const target = registry
        .ports(targetNode, graph, document, interfacePort)
        .find((port) => port.id === connection.target.portId);
      if (!source || !target || !registry.compatible(source, target)) {
        throw new Error("Incompatible connection ports");
      }
      const pair = JSON.stringify([
          connection.source.nodeId,
          connection.source.portId,
          connection.target.nodeId,
          connection.target.portId,
        ]),
        endpoint = JSON.stringify([
          connection.target.nodeId,
          connection.target.portId,
        ]);
      if (pairs.has(pair)) throw new Error("Duplicate connection");
      if (!target.multiple && targets.has(endpoint)) {
        throw new Error("Input already connected");
      }
      pairs.add(pair);
      targets.add(endpoint);
    }
    const membership = new Set<string>();
    for (const [key, group] of Object.entries(graph.groups)) {
      checkpoint?.();
      assertRecord(group, "Group");
      claim(group.id, key);
      if (typeof group.label !== "string" || !Array.isArray(group.nodeIds)) {
        throw new Error("Invalid group");
      }
      for (const id of group.nodeIds) {
        checkpoint?.();
        if (!Object.hasOwn(graph.nodes, id) || membership.has(id)) {
          throw new Error("A node must belong to at most one immediate group");
        }
        membership.add(id);
      }
    }
    const complete = new Set<string>();
    for (const id of Object.keys(graph.groups)) {
      const ancestors = new Set<string>();
      let parent: string | undefined = id;
      while (parent && !complete.has(parent)) {
        checkpoint?.();
        if (ancestors.has(parent) || !Object.hasOwn(graph.groups, parent)) {
          throw new Error("Invalid group hierarchy");
        }
        ancestors.add(parent);
        parent = graph.groups[parent].parentId;
      }
      for (const ancestor of ancestors) {
        checkpoint?.();
        complete.add(ancestor);
      }
    }
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const walk = (id: string) => {
    checkpoint?.();
    if (visiting.has(id)) {
      throw new Error("Recursive subgraph definitions are not supported");
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const node of Object.values(document.graphs[id].nodes)) {
      checkpoint?.();
      if (node.type === "@subgraph") walk(node.subgraphId!);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of Object.keys(document.graphs)) walk(id);
  return document;
}
