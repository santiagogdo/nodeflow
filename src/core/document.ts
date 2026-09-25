import { applyPatches, assertId, cloneJSON, diff, freeze } from "./json.ts";
import { NodeRegistry } from "./registry.ts";
import { validateDocument } from "./validation.ts";
import { emptyGraph, uniqueId } from "./types.ts";
import type {
  DocumentChange,
  DocumentSnapshot,
  Endpoint,
  GraphCommand,
  GraphFragment,
  GraphRecord,
  NewNode,
  NodeRecord,
  Patch,
  Point,
  ReadonlyDocument,
} from "./types.ts";

interface HistoryEntry {
  label: string;
  patches: Patch[];
}

function ownRecord<T>(records: Record<string, T>, id: string): T | undefined {
  return Object.hasOwn(records, id) ? records[id] : undefined;
}

function requireRecord<T>(
  records: Record<string, T>,
  id: string,
  kind: string,
): T {
  const record = ownRecord(records, id);
  if (!record) throw new Error(`${kind} does not exist`);
  return record;
}

/** A DOM-free document. Commands are validated atomically at the transaction seam. */
export class GraphDocument {
  private state: DocumentSnapshot;
  private draft: DocumentSnapshot | null = null;
  private listeners = new Set<(change: DocumentChange) => void>();
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private transactionError: unknown;
  public revision = 0;
  readonly historyLimit: number;

  constructor(
    readonly registry: NodeRegistry,
    options: {
      initialState?: unknown;
      historyLimit?: number;
      label?: string;
    } = {},
  ) {
    if (
      options.historyLimit !== undefined &&
      (!Number.isInteger(options.historyLimit) || options.historyLimit < 0)
    ) {
      throw new Error("History limit must be a finite nonnegative integer");
    }
    this.historyLimit = Math.max(0, Math.floor(options.historyLimit ?? 100));
    this.state = freeze(
      validateDocument(
        options.initialState ?? {
          version: 2,
          rootGraphId: "root",
          graphs: { root: emptyGraph("root", options.label) },
        },
        registry,
      ),
    );
  }
  snapshot(): ReadonlyDocument {
    return this.state;
  }
  serialize(): string {
    return JSON.stringify(
      this.state,
      (_key, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
          )
          : value,
      2,
    );
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  subscribe(listener: (change: DocumentChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify(
    label: string,
    source: DocumentChange["source"],
    patches: Patch[],
  ) {
    const event = freeze({ revision: ++this.revision, label, source, patches });
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Nodeflow document subscriber failed", error);
      }
    }
  }
  transaction<T>(label: string, action: () => T): T {
    if (this.draft) {
      try {
        return action();
      } catch (error) {
        this.transactionError = error;
        throw error;
      }
    }
    this.draft = cloneJSON(this.state);
    this.transactionError = undefined;
    let result: T;
    let next: DocumentSnapshot;
    try {
      result = action();
      if (result && typeof (result as { then?: unknown }).then === "function") {
        throw new Error("Document transactions must be synchronous");
      }
      if (this.transactionError) throw this.transactionError;
      next = validateDocument(this.draft, this.registry);
    } finally {
      this.draft = null;
    }
    const patches = diff(this.state, next);
    if (patches.length) {
      this.state = freeze(next);
      if (this.historyLimit) {
        this.past.push({ label, patches });
        if (this.past.length > this.historyLimit) this.past.shift();
      }
      this.future = [];
      this.notify(label, "edit", patches);
    }
    return result;
  }
  load(input: unknown): void {
    if (this.draft) {
      throw new Error("Cannot replace a document during a transaction");
    }
    const next = validateDocument(
      typeof input === "string" ? JSON.parse(input) : input,
      this.registry,
    );
    const patches = diff(this.state, next);
    this.state = freeze(next);
    this.past = [];
    this.future = [];
    this.notify("Load document", "load", patches);
  }
  undo(): void {
    if (this.draft) throw new Error("Cannot undo during a transaction");
    const entry = this.past.at(-1);
    if (!entry) return;
    const next = validateDocument(
      applyPatches(this.state, entry.patches, true),
      this.registry,
    );
    const patches = diff(this.state, next);
    this.past.pop();
    this.future.push(entry);
    this.state = freeze(next);
    this.notify(entry.label, "undo", patches);
  }
  redo(): void {
    if (this.draft) throw new Error("Cannot redo during a transaction");
    const entry = this.future.at(-1);
    if (!entry) return;
    const next = validateDocument(
      applyPatches(this.state, entry.patches),
      this.registry,
    );
    this.future.pop();
    this.past.push(entry);
    this.state = freeze(next);
    this.notify(entry.label, "redo", entry.patches);
  }
  addNode(node: NewNode, graphId?: string): string {
    return this.dispatch({ type: "add-node", node, graphId }) as string;
  }
  connect(source: Endpoint, target: Endpoint, graphId?: string): string {
    return this.dispatch({
      type: "connect",
      source,
      target,
      graphId,
    }) as string;
  }
  dispatch(command: GraphCommand): string | undefined {
    if (!this.draft) {
      return this.transaction(
        command.type.replaceAll("-", " "),
        () => this.dispatch(command),
      );
    }
    try {
      return this.apply(command);
    } catch (error) {
      this.transactionError = error;
      throw error;
    }
  }
  private apply(command: GraphCommand): string | undefined {
    const document = this.draft!;
    const graph = requireRecord(
      document.graphs,
      command.graphId ?? document.rootGraphId,
      "Graph",
    );
    const available = (id: string) => {
      assertId(id);
      if (
        Object.hasOwn(graph.nodes, id) ||
        Object.hasOwn(graph.connections, id) ||
        Object.hasOwn(graph.groups, id)
      ) {
        throw new Error(`ID already exists: ${id}`);
      }
    };
    switch (command.type) {
      case "add-node": {
        const params = command.node,
          id = params.id ?? uniqueId();
        available(id);
        const definition = params.type.startsWith("@")
          ? undefined
          : this.registry.get(params.type);
        graph.nodes[id] = {
          id,
          type: params.type,
          label: params.label ??
            definition?.title ??
            (params.type === "@subgraph"
              ? "Subgraph"
              : params.type === "@input"
              ? "Graph input"
              : "Graph output"),
          data: {
            ...cloneJSON(definition?.defaults ?? {}),
            ...cloneJSON(params.data ?? {}),
          },
          position: cloneJSON(params.position ?? { x: 0, y: 0 }),
          ...(params.width === undefined ? {} : { width: params.width }),
          ...(params.subgraphId === undefined
            ? {}
            : { subgraphId: params.subgraphId }),
        };
        return id;
      }
      case "update-node": {
        const node = requireRecord(graph.nodes, command.nodeId, "Node");
        const changes = cloneJSON(command.changes);
        graph.nodes[node.id] = {
          ...node,
          ...changes,
          data: changes.data ? { ...node.data, ...changes.data } : node.data,
        };
        break;
      }
      case "move-nodes":
        for (const [id, position] of Object.entries(command.positions)) {
          const node = requireRecord(graph.nodes, id, "Node");
          node.position = cloneJSON(position);
        }
        break;
      case "remove": {
        const ids = new Set(command.nodeIds ?? []);
        for (const id of ids) delete graph.nodes[id];
        for (const edge of Object.values(graph.connections)) {
          if (
            ids.has(edge.source.nodeId) ||
            ids.has(edge.target.nodeId) ||
            command.connectionIds?.includes(edge.id)
          ) {
            delete graph.connections[edge.id];
          }
        }
        for (const group of Object.values(graph.groups)) {
          group.nodeIds = group.nodeIds.filter((id) => !ids.has(id));
        }
        for (const id of command.groupIds ?? []) {
          this.apply({ type: "ungroup", groupId: id, graphId: graph.id });
        }
        break;
      }
      case "connect": {
        const id = command.id ?? uniqueId("e");
        available(id);
        graph.connections[id] = {
          id,
          source: cloneJSON(command.source),
          target: cloneJSON(command.target),
          ...(command.label === undefined ? {} : { label: command.label }),
        };
        return id;
      }
      case "disconnect":
        delete graph.connections[command.connectionId];
        break;
      case "add-group":
        available(command.group.id);
        graph.groups[command.group.id] = cloneJSON(command.group);
        return command.group.id;
      case "update-group": {
        const group = requireRecord(graph.groups, command.groupId, "Group");
        graph.groups[command.groupId] = {
          ...group,
          ...cloneJSON(command.changes),
        };
        break;
      }
      case "ungroup": {
        const removed = ownRecord(graph.groups, command.groupId);
        if (!removed) break;
        for (const group of Object.values(graph.groups)) {
          if (group.parentId === removed.id) {
            if (removed.parentId) group.parentId = removed.parentId;
            else delete group.parentId;
          }
        }
        if (removed.parentId) {
          requireRecord(graph.groups, removed.parentId, "Group").nodeIds.push(
            ...removed.nodeIds,
          );
        }
        delete graph.groups[removed.id];
        break;
      }
      case "set-interface":
        graph.inputs = cloneJSON(command.inputs);
        graph.outputs = cloneJSON(command.outputs);
        break;
      case "rename-graph":
        graph.label = command.label;
        break;
      case "add-graph": {
        assertId(command.graph.id);
        if (Object.hasOwn(document.graphs, command.graph.id)) {
          throw new Error("Graph ID already exists");
        }
        document.graphs[command.graph.id] = cloneJSON(command.graph);
        return command.graph.id;
      }
      case "remove-graph":
        delete document.graphs[command.id];
        break;
    }
  }
  /** Turns selected nodes into a reusable definition, retaining each crossing connection. */
  createSubgraph(
    nodeIds: readonly string[],
    graphId = this.state.rootGraphId,
  ): string {
    return this.transaction("Create subgraph", () => {
      const document = this.draft!,
        graph = requireRecord(document.graphs, graphId, "Graph");
      const selected = new Set(
        nodeIds.filter((id) => Object.hasOwn(graph.nodes, id)),
      );
      if (!selected.size) throw new Error("Select at least one node");
      if (
        [...selected].some(
          (id) =>
            graph.nodes[id].type === "@input" ||
            graph.nodes[id].type === "@output",
        )
      ) {
        throw new Error("Interface nodes cannot be extracted");
      }
      const nested = emptyGraph(uniqueId("graph"), "Transform group");
      const nodes = [...selected].map((id) => graph.nodes[id]);
      const origin = {
        x: Math.min(...nodes.map((node) => node.position.x)),
        y: Math.min(...nodes.map((node) => node.position.y)),
      };
      for (const node of nodes) {
        nested.nodes[node.id] = {
          ...node,
          position: {
            x: node.position.x - origin.x + 300,
            y: node.position.y - origin.y + 80,
          },
        };
        delete graph.nodes[node.id];
      }
      document.graphs[nested.id] = nested;
      const instanceId = this.addNode(
        {
          type: "@subgraph",
          label: nested.label,
          position: origin,
          subgraphId: nested.id,
        },
        graphId,
      );
      let inputIndex = 0,
        outputIndex = 0;
      const outputs = new Map<string, string>();
      for (const edge of Object.values(graph.connections)) {
        const sourceInside = selected.has(edge.source.nodeId),
          targetInside = selected.has(edge.target.nodeId);
        if (sourceInside && targetInside) {
          nested.connections[edge.id] = edge;
          delete graph.connections[edge.id];
        } else if (targetInside) {
          const target = this.registry
            .ports(nested.nodes[edge.target.nodeId], nested, document)
            .find((port) => port.id === edge.target.portId)!;
          const id = `in${++inputIndex}`;
          nested.inputs.push({
            id,
            label: target.label ?? target.id,
            dataType: target.dataType,
            required: target.required ?? true,
          });
          const terminal = this.addNode(
            {
              type: "@input",
              label: target.label ?? target.id,
              data: { portId: id },
              position: { x: 0, y: inputIndex * 140 },
            },
            nested.id,
          );
          const internalId = uniqueId("e");
          nested.connections[internalId] = {
            id: internalId,
            source: { nodeId: terminal, portId: "value" },
            target: edge.target,
          };
          edge.target = { nodeId: instanceId, portId: id };
        } else if (sourceInside) {
          const key = JSON.stringify(edge.source);
          let id = outputs.get(key);
          if (!id) {
            id = `out${++outputIndex}`;
            outputs.set(key, id);
            const source = this.registry
              .ports(nested.nodes[edge.source.nodeId], nested, document)
              .find((port) => port.id === edge.source.portId)!;
            nested.outputs.push({
              id,
              label: source.label ?? source.id,
              dataType: source.dataType,
            });
            const maxX = Math.max(...nodes.map((node) =>
              node.position.x - origin.x
            )) +
              650;
            const terminal = this.addNode(
              {
                type: "@output",
                label: source.label ?? source.id,
                data: { portId: id },
                position: { x: maxX, y: outputIndex * 140 },
              },
              nested.id,
            );
            const internalId = uniqueId("e");
            nested.connections[internalId] = {
              id: internalId,
              source: edge.source,
              target: { nodeId: terminal, portId: "value" },
            };
          }
          edge.source = { nodeId: instanceId, portId: id };
        }
      }
      const contained = new Set(this.containedGroups(graph, selected));
      for (const id of contained) {
        const group = graph.groups[id];
        if (group.parentId && !contained.has(group.parentId)) {
          delete group.parentId;
        }
        nested.groups[id] = group;
        delete graph.groups[id];
      }
      for (const group of Object.values(graph.groups)) {
        group.nodeIds = group.nodeIds.filter((id) => !selected.has(id));
      }
      return instanceId;
    });
  }
  private containedGroups(graph: GraphRecord, ids: Set<string>): string[] {
    const members = (id: string): string[] => [
      ...graph.groups[id].nodeIds,
      ...Object.values(graph.groups)
        .filter((group) => group.parentId === id)
        .flatMap((group) => members(group.id)),
    ];
    return Object.keys(graph.groups).filter((id) => {
      const nodes = members(id);
      return nodes.length > 0 && nodes.every((node) => ids.has(node));
    });
  }
  copy(
    nodeIds: readonly string[],
    graphId = this.state.rootGraphId,
  ): GraphFragment {
    const graph = requireRecord(this.state.graphs, graphId, "Graph"),
      ids = new Set(nodeIds);
    const nodes = Object.values(graph.nodes).filter((node) => ids.has(node.id));
    const definitions: Record<string, GraphRecord> = {};
    const include = (id: string) => {
      if (Object.hasOwn(definitions, id)) return;
      definitions[id] = requireRecord(this.state.graphs, id, "Graph");
      Object.values(definitions[id].nodes).forEach((node) => {
        if (node.subgraphId) include(node.subgraphId);
      });
    };
    nodes.forEach((node) => {
      if (node.subgraphId) include(node.subgraphId);
    });
    const groups = this.containedGroups(graph, ids).map(
      (id) => graph.groups[id],
    );
    const groupIds = new Set(groups.map((group) => group.id));
    return cloneJSON({
      format: "nodeflow/fragment",
      version: 2,
      nodes,
      connections: Object.values(graph.connections).filter(
        (edge) => ids.has(edge.source.nodeId) && ids.has(edge.target.nodeId),
      ),
      groups: groups.map((group) => {
        const copy = { ...group };
        if (copy.parentId && !groupIds.has(copy.parentId)) delete copy.parentId;
        return copy;
      }),
      definitions,
    });
  }
  paste(
    fragment: GraphFragment,
    graphId = this.state.rootGraphId,
    offset: Point = { x: 32, y: 32 },
  ): string[] {
    const content = cloneJSON(fragment);
    if (
      content.format !== "nodeflow/fragment" ||
      content.version !== 2 ||
      !Array.isArray(content.nodes) ||
      !Array.isArray(content.connections) ||
      !Array.isArray(content.groups) ||
      !content.definitions
    ) {
      throw new Error("Invalid Nodeflow clipboard");
    }
    const fragmentIds = [
      ...content.nodes,
      ...content.connections,
      ...content.groups,
    ].map((item) => item.id);
    if (new Set(fragmentIds).size !== fragmentIds.length) {
      throw new Error("Duplicate clipboard IDs");
    }
    return this.transaction("Paste nodes", () => {
      const document = this.draft!,
        graph = requireRecord(document.graphs, graphId, "Graph"),
        definitions = new Map<string, string>();
      for (const id of Object.keys(content.definitions)) {
        definitions.set(id, uniqueId("graph"));
      }
      for (const [id, definition] of Object.entries(content.definitions)) {
        definition.id = definitions.get(id)!;
        for (const node of Object.values(definition.nodes)) {
          if (node.subgraphId) {
            node.subgraphId = definitions.get(node.subgraphId) ??
              node.subgraphId;
          }
        }
        document.graphs[definition.id] = definition;
      }
      const ids = new Map(content.nodes.map((node) => [node.id, uniqueId()]));
      for (const node of content.nodes) {
        node.id = ids.get(node.id)!;
        node.position.x += offset.x;
        node.position.y += offset.y;
        if (node.subgraphId) {
          node.subgraphId = definitions.get(node.subgraphId) ?? node.subgraphId;
        }
        graph.nodes[node.id] = node;
      }
      for (const edge of content.connections) {
        edge.id = uniqueId("e");
        edge.source.nodeId = ids.get(edge.source.nodeId)!;
        edge.target.nodeId = ids.get(edge.target.nodeId)!;
        graph.connections[edge.id] = edge;
      }
      const groupIds = new Map(
        content.groups.map((group) => [group.id, uniqueId("group")]),
      );
      for (const group of content.groups) {
        group.id = groupIds.get(group.id)!;
        group.nodeIds = group.nodeIds.map((id) => ids.get(id)!);
        if (group.parentId) group.parentId = groupIds.get(group.parentId);
        graph.groups[group.id] = group;
      }
      return [...ids.values()];
    });
  }
}
