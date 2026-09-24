import type {
  DeepReadonly,
  NodeData,
  NodeRecord,
  ReadonlyDocument,
} from "../core/types.ts";
export const SKIP: unique symbol = Symbol("nodeflow.skip");
export type NodeOutputs = Record<string, unknown | typeof SKIP>;
export type ExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "skipped"
  | "failed"
  | "cancelled";
export interface ExecutionContext {
  node: DeepReadonly<NodeRecord>;
  data: DeepReadonly<NodeData>;
  inputs: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
  path: readonly string[];
  triggerPayload?: unknown;
  log: (message: string) => void;
}
export type NodeExecutor = (
  context: ExecutionContext,
) => NodeOutputs | Promise<NodeOutputs>;
export interface RunEvent {
  runId: string;
  type: "run" | "node" | "log";
  status: ExecutionStatus;
  path: readonly string[];
  time: number;
  message?: string;
  outputs?: NodeOutputs;
}
export interface NodeResult {
  status: ExecutionStatus;
  outputs: NodeOutputs;
  error?: string;
  path: string[];
}
export interface RunResult {
  id: string;
  status: "completed" | "failed" | "cancelled";
  outputs: NodeOutputs;
  nodes: Record<string, NodeResult>;
  error?: string;
  duration: number;
}
export interface RunHandle {
  readonly id: string;
  readonly result: Promise<RunResult>;
  readonly events: readonly RunEvent[];
  subscribe(listener: (event: RunEvent) => void): () => void;
  cancel(reason?: string): void;
}
export interface RunOptions {
  graphId?: string;
  inputs?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxExecutions?: number;
}
export interface ExecutorDefinition {
  type: string;
  execute: NodeExecutor;
  trigger?: boolean;
}
export interface CompiledRun {
  document: ReadonlyDocument;
  order: Map<string, string[]>;
}
