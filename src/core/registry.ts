import { assertId, cloneJSON } from "./json.ts";
import type {
  DeepReadonly,
  DocumentSnapshot,
  GraphRecord,
  NodeDefinition,
  NodeRecord,
  PortDefinition,
} from "./types.ts";

export class NodeRegistry {
  private definitions = new Map<string, NodeDefinition>();
  register(definition: NodeDefinition): this {
    assertId(definition.type);
    if (
      definition.type.startsWith("@") ||
      this.definitions.has(definition.type)
    ) {
      throw new Error(
        `Node type already registered or reserved: ${definition.type}`,
      );
    }
    this.definitions.set(definition.type, {
      ...definition,
      defaults: definition.defaults ? cloneJSON(definition.defaults) : {},
    });
    return this;
  }
  get(type: string): NodeDefinition {
    const definition = this.definitions.get(type);
    if (!definition) throw new Error(`Unknown node type: ${type}`);
    return definition;
  }
  list(): readonly NodeDefinition[] {
    return [...this.definitions.values()];
  }
  ports(
    node: DeepReadonly<NodeRecord>,
    graph: DeepReadonly<GraphRecord>,
    document: DeepReadonly<DocumentSnapshot>,
  ): PortDefinition[] {
    if (node.type === "@subgraph") {
      const nested = node.subgraphId && document.graphs[node.subgraphId];
      if (!nested) {
        throw new Error(`Missing subgraph definition: ${node.subgraphId}`);
      }
      return [
        ...nested.inputs.map((port) => ({
          ...port,
          direction: "input" as const,
        })),
        ...nested.outputs.map((port) => ({
          ...port,
          direction: "output" as const,
        })),
      ] as PortDefinition[];
    }
    if (node.type === "@input" || node.type === "@output") {
      const input = node.type === "@input";
      const port = (input ? graph.inputs : graph.outputs).find(
        (port) => port.id === node.data.portId,
      );
      if (!port) {
        throw new Error(`Unknown graph interface port: ${node.data.portId}`);
      }
      return [
        { ...port, id: "value", direction: input ? "output" : "input" },
      ] as PortDefinition[];
    }
    const definition = this.get(node.type);
    return cloneJSON(
      typeof definition.ports === "function"
        ? definition.ports(node.data as NodeRecord["data"])
        : definition.ports,
    ) as PortDefinition[];
  }
  compatible(source: PortDefinition, target: PortDefinition): boolean {
    return (
      source.direction === "output" &&
      target.direction === "input" &&
      (source.dataType === target.dataType ||
        source.dataType === "any" ||
        target.dataType === "any")
    );
  }
}
