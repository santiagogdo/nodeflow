export type JsonValue = null | boolean | number | string | JsonValue[] | {
  [key: string]: JsonValue;
};
export type NodeData = Record<string, JsonValue>;
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export type PortSide = "left" | "right" | "top" | "bottom";
export interface GraphPort {
  id: string;
  label?: string;
  dataType: string;
  required?: boolean;
  multiple?: boolean;
  defaultValue?: JsonValue;
}
export interface PortDefinition extends GraphPort {
  direction: "input" | "output";
  side?: PortSide;
}
export interface NodeDefinition {
  type: string;
  title: string;
  category?: string;
  description?: string;
  defaults?: NodeData;
  ports:
    | readonly PortDefinition[]
    | ((data: Readonly<NodeData>) => readonly PortDefinition[]);
  validate?: (data: Readonly<NodeData>) => void;
}
export interface NodeRecord {
  id: string;
  type: string;
  label: string;
  data: NodeData;
  position: Point;
  width?: number;
  subgraphId?: string;
}
export interface Endpoint {
  nodeId: string;
  portId: string;
}
export interface ConnectionRecord {
  id: string;
  source: Endpoint;
  target: Endpoint;
  label?: string;
}
export interface GroupRecord {
  id: string;
  label: string;
  nodeIds: string[];
  parentId?: string;
  color?: string;
}
export interface GraphRecord {
  id: string;
  label: string;
  nodes: Record<string, NodeRecord>;
  connections: Record<string, ConnectionRecord>;
  groups: Record<string, GroupRecord>;
  inputs: GraphPort[];
  outputs: GraphPort[];
}
export interface DocumentSnapshot {
  version: 2;
  rootGraphId: string;
  graphs: Record<string, GraphRecord>;
}
export type DeepReadonly<
  T,
  Depth extends unknown[] = [],
> = Depth["length"] extends 8 ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K], [...Depth, unknown]> }
  : T;
export type ReadonlyDocument = DeepReadonly<DocumentSnapshot>;
export interface NewNode {
  id?: string;
  type: string;
  label?: string;
  data?: NodeData;
  position?: Point;
  width?: number;
  subgraphId?: string;
}
export type GraphCommand =
  & (
    | { type: "add-node"; node: NewNode }
    | {
      type: "update-node";
      nodeId: string;
      changes: Partial<
        Pick<NodeRecord, "label" | "data" | "position" | "width">
      >;
    }
    | { type: "move-nodes"; positions: Record<string, Point> }
    | {
      type: "remove";
      nodeIds?: string[];
      connectionIds?: string[];
      groupIds?: string[];
    }
    | {
      type: "connect";
      id?: string;
      source: Endpoint;
      target: Endpoint;
      label?: string;
    }
    | { type: "disconnect"; connectionId: string }
    | { type: "add-group"; group: GroupRecord }
    | {
      type: "update-group";
      groupId: string;
      changes: Partial<Omit<GroupRecord, "id">>;
    }
    | { type: "ungroup"; groupId: string }
    | { type: "set-interface"; inputs: GraphPort[]; outputs: GraphPort[] }
    | { type: "rename-graph"; label: string }
    | { type: "add-graph"; graph: GraphRecord }
    | { type: "remove-graph"; id: string }
  )
  & { graphId?: string };
export interface Patch {
  path: string[];
  before?: JsonValue;
  after?: JsonValue;
  hadBefore: boolean;
  hadAfter: boolean;
}
export interface DocumentChange {
  revision: number;
  label: string;
  source: "edit" | "undo" | "redo" | "load";
  patches: readonly Patch[];
}
export interface GraphFragment {
  format: "nodeflow/fragment";
  version: 2;
  nodes: NodeRecord[];
  connections: ConnectionRecord[];
  groups: GroupRecord[];
  definitions: Record<string, GraphRecord>;
}

export function uniqueId(prefix = "n"): string {
  return `${prefix}_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
}
export function emptyGraph(id = "root", label = "Untitled graph"): GraphRecord {
  return {
    id,
    label,
    nodes: {},
    connections: {},
    groups: {},
    inputs: [],
    outputs: [],
  };
}
