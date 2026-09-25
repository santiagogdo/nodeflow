import { NodeRegistry, uniqueId } from "../core/index.ts";
import { freezeChecked } from "../core/json.ts";
import { createInterfacePortLookup } from "../core/registry.ts";
import { validateDocumentChecked } from "../core/validation.ts";
import type { ReadonlyDocument } from "../core/types.ts";
import { SKIP } from "./types.ts";
import type {
  CompiledRun,
  ExecutorDefinition,
  NodeExecutor,
  NodeOutputs,
  NodeResult,
  RunEvent,
  RunHandle,
  RunOptions,
  RunResult,
} from "./types.ts";

/** The same UTF-16 ordering as Array.sort(), without re-sorting or shifting. */
class ReadyNodes {
  private heap: string[] = [];
  get size() {
    return this.heap.length;
  }
  push(id: string) {
    let at = this.heap.length;
    this.heap.push(id);
    while (at > 0) {
      const parent = Math.floor((at - 1) / 2);
      if (this.heap[parent] <= id) break;
      this.heap[at] = this.heap[parent];
      at = parent;
    }
    this.heap[at] = id;
  }
  pop(): string {
    const first = this.heap[0], last = this.heap.pop()!;
    if (this.heap.length) {
      let at = 0;
      while (at * 2 + 1 < this.heap.length) {
        let child = at * 2 + 1;
        if (
          child + 1 < this.heap.length &&
          this.heap[child + 1] < this.heap[child]
        ) child++;
        if (last <= this.heap[child]) break;
        this.heap[at] = this.heap[child];
        at = child;
      }
      this.heap[at] = last;
    }
    return first;
  }
}

export class Runner {
  private executors = new Map<string, ExecutorDefinition>();
  private active: RunHandle | null = null;
  constructor(readonly registry: NodeRegistry) {}
  register(
    type: string,
    execute: NodeExecutor,
    options: { trigger?: boolean } = {},
  ): this {
    this.registry.get(type);
    if (this.executors.has(type)) {
      throw new Error(`Executor already registered: ${type}`);
    }
    this.executors.set(type, { type, execute, ...options });
    return this;
  }
  get running(): boolean {
    return this.active !== null;
  }
  compile(
    snapshot: ReadonlyDocument,
    graphId = snapshot.rootGraphId,
  ): CompiledRun {
    return this.compileChecked(snapshot, graphId);
  }
  private compileChecked(
    snapshot: ReadonlyDocument,
    graphId: string,
    checkpoint?: () => void,
  ): CompiledRun {
    checkpoint?.();
    const document = freezeChecked(
        validateDocumentChecked(snapshot, this.registry, checkpoint),
        checkpoint,
      ),
      order = new Map<string, string[]>(),
      interfacePort = createInterfacePortLookup(checkpoint);
    const visit = (id: string) => {
      checkpoint?.();
      if (order.has(id)) return;
      const graph = document.graphs[id];
      if (!graph) throw new Error(`Unknown graph: ${id}`);
      const indegree = new Map(Object.keys(graph.nodes).map((id) => [id, 0]));
      const outgoing = new Map<string, string[]>();
      const connected = new Map<string, Set<string>>();
      for (const edge of Object.values(graph.connections)) {
        checkpoint?.();
        indegree.set(edge.target.nodeId, indegree.get(edge.target.nodeId)! + 1);
        const list = outgoing.get(edge.source.nodeId) ?? [];
        list.push(edge.target.nodeId);
        outgoing.set(edge.source.nodeId, list);
        const ports = connected.get(edge.target.nodeId) ?? new Set<string>();
        ports.add(edge.target.portId);
        connected.set(edge.target.nodeId, ports);
      }
      const ready = new ReadyNodes(), sorted: string[] = [];
      for (const [id, degree] of indegree) {
        checkpoint?.();
        if (degree === 0) ready.push(id);
      }
      while (ready.size) {
        checkpoint?.();
        const current = ready.pop();
        sorted.push(current);
        for (const next of outgoing.get(current) ?? []) {
          checkpoint?.();
          indegree.set(next, indegree.get(next)! - 1);
          if (indegree.get(next) === 0) {
            ready.push(next);
          }
        }
      }
      if (sorted.length !== indegree.size) {
        throw new Error(`Graph '${graph.label}' contains an execution cycle`);
      }
      order.set(id, sorted);
      for (const node of Object.values(graph.nodes)) {
        checkpoint?.();
        if (node.type === "@subgraph") visit(node.subgraphId!);
        else if (!node.type.startsWith("@") && !this.executors.has(node.type)) {
          throw new Error(`No executor registered for ${node.type}`);
        }
        for (
          const port of this.registry.ports(
            node,
            graph,
            document,
            interfacePort,
          )
        ) {
          checkpoint?.();
          if (
            port.direction === "input" &&
            port.required !== false &&
            port.defaultValue === undefined &&
            !Object.hasOwn(node.data, port.id) &&
            !connected.get(node.id)?.has(port.id)
          ) {
            throw new Error(
              `Missing required input '${
                port.label ?? port.id
              }' on '${node.label}'`,
            );
          }
        }
      }
    };
    visit(graphId);
    checkpoint?.();
    return { document, order };
  }
  run(snapshot: ReadonlyDocument, options: RunOptions = {}): RunHandle {
    return this.start(snapshot, options);
  }
  trigger(
    snapshot: ReadonlyDocument,
    nodeId: string,
    payload: unknown,
    options: RunOptions = {},
  ): RunHandle {
    const graph = snapshot.graphs[options.graphId ?? snapshot.rootGraphId],
      node = graph?.nodes[nodeId];
    if (!node || !this.executors.get(node.type)?.trigger) {
      throw new Error("The selected node is not a registered trigger");
    }
    return this.start(snapshot, options, { nodeId, payload });
  }
  private start(
    snapshot: ReadonlyDocument,
    options: RunOptions,
    trigger?: { nodeId: string; payload: unknown },
  ): RunHandle {
    if (this.active) throw new Error("This runner already has an active run");
    const graphId = options.graphId ?? snapshot.rootGraphId;
    const timeoutMs = options.timeoutMs ?? 30_000,
      maxExecutions = options.maxExecutions ?? 10_000;
    if (
      !Number.isFinite(timeoutMs) ||
      timeoutMs <= 0 ||
      !Number.isInteger(maxExecutions) ||
      maxExecutions <= 0
    ) {
      throw new Error("Run limits must be positive");
    }
    const id = uniqueId("run"),
      controller = new AbortController(),
      events: RunEvent[] = [],
      listeners = new Set<(event: RunEvent) => void>();
    const nodes: Record<string, NodeResult> = {},
      started = performance.now();
    let executionCount = 0,
      sliceStarted = started,
      timedOut = false,
      settled = false;
    const emit = (event: Omit<RunEvent, "runId" | "time">) => {
      if (settled) return;
      const complete = {
        ...event,
        runId: id,
        time: performance.now() - started,
      };
      events.push(complete);
      for (const listener of listeners) {
        try {
          listener(complete);
        } catch (error) {
          console.error("Nodeflow run subscriber failed", error);
        }
      }
    };
    const check = () => {
      if (
        !controller.signal.aborted && performance.now() - started >= timeoutMs
      ) {
        timedOut = true;
        controller.abort("Run timed out");
      }
      if (controller.signal.aborted) {
        throw new Error(String(controller.signal.reason ?? "Run cancelled"));
      }
    };
    const abortFromHost = () =>
      controller.abort(options.signal?.reason ?? "Run cancelled");
    let compiled!: CompiledRun;
    try {
      compiled = this.compileChecked(snapshot, graphId, () => {
        if (options.signal?.aborted) abortFromHost();
        check();
      });
    } catch (error) {
      // Structural errors stay synchronous. Resource termination is delivered
      // through the usual failed/cancelled handle without starting executors.
      if (!controller.signal.aborted) throw error;
    }
    const awaitExecutor = <T>(promise: T | Promise<T>): Promise<T> =>
      new Promise((resolve, reject) => {
        const abort = () =>
          reject(
            new Error(String(controller.signal.reason ?? "Run cancelled")),
          );
        if (controller.signal.aborted) {
          abort();
          return;
        }
        controller.signal.addEventListener("abort", abort, { once: true });
        Promise.resolve(promise).then(
          (value) => {
            controller.signal.removeEventListener("abort", abort);
            resolve(value);
          },
          (error) => {
            controller.signal.removeEventListener("abort", abort);
            reject(error);
          },
        );
      });
    const executeGraph = async (
      currentId: string,
      graphInputs: Record<string, unknown>,
      path: string[],
    ): Promise<NodeOutputs> => {
      const graph = compiled.document.graphs[currentId],
        values = new Map<string, NodeOutputs>(),
        graphOutputs: NodeOutputs = {};
      const incoming = new Map<string, (typeof graph.connections)[string][]>();
      for (const edge of Object.values(graph.connections)) {
        const edges = incoming.get(edge.target.nodeId) ?? [];
        edges.push(edge);
        incoming.set(edge.target.nodeId, edges);
      }
      for (const nodeId of compiled.order.get(currentId)!) {
        const nodePath = [...path, nodeId],
          key = JSON.stringify(nodePath);
        nodes[key] = { status: "pending", outputs: {}, path: nodePath };
        emit({ type: "node", status: "pending", path: nodePath });
      }
      for (const nodeId of compiled.order.get(currentId)!) {
        check();
        if (performance.now() - sliceStarted > 8) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          sliceStarted = performance.now();
          check();
        }
        const node = graph.nodes[nodeId],
          nodePath = [...path, nodeId],
          key = JSON.stringify(nodePath),
          definition = this.executors.get(node.type);
        const inputs: Record<string, unknown> = {};
        let skipped = false;
        for (
          const port of this.registry
            .ports(node, graph, compiled.document)
            .filter((port) => port.direction === "input")
        ) {
          const sources = (incoming.get(nodeId) ?? []).filter(
            (edge) => edge.target.portId === port.id,
          );
          const received = sources
            .map((edge) => {
              const output = values.get(edge.source.nodeId);
              return output && Object.hasOwn(output, edge.source.portId)
                ? output[edge.source.portId]
                : SKIP;
            })
            .filter((value) => value !== SKIP);
          if (sources.length && !received.length) {
            if (port.required !== false) skipped = true;
          } else if (sources.length) {
            inputs[port.id] = port.multiple ? received : received[0];
          } else if (Object.hasOwn(node.data, port.id)) {
            inputs[port.id] = node.data[port.id];
          } else if (port.defaultValue !== undefined) {
            inputs[port.id] = port.defaultValue;
          }
        }
        if (
          definition?.trigger &&
          !(
            trigger &&
            currentId === graphId &&
            path.length === 0 &&
            nodeId === trigger.nodeId
          )
        ) {
          skipped = true;
        }
        if (
          node.type === "@input" &&
          !Object.hasOwn(graphInputs, String(node.data.portId))
        ) {
          skipped = true;
        }
        if (skipped) {
          values.set(nodeId, {});
          nodes[key].status = "skipped";
          emit({ type: "node", status: "skipped", path: nodePath });
          continue;
        }
        if (++executionCount > maxExecutions) {
          throw new Error("Node execution limit exceeded");
        }
        nodes[key].status = "running";
        emit({ type: "node", status: "running", path: nodePath });
        try {
          let outputs: NodeOutputs;
          if (node.type === "@input") {
            outputs = { value: graphInputs[String(node.data.portId)] };
          } else if (node.type === "@output") {
            graphOutputs[String(node.data.portId)] = inputs.value;
            outputs = {};
          } else if (node.type === "@subgraph") {
            outputs = await executeGraph(node.subgraphId!, inputs, nodePath);
          } else {
            outputs = await awaitExecutor(
              definition!.execute({
                node,
                data: node.data,
                inputs,
                path: nodePath,
                signal: controller.signal,
                ...(trigger && nodeId === trigger.nodeId && !path.length
                  ? { triggerPayload: trigger.payload }
                  : {}),
                log: (message) => {
                  if (!controller.signal.aborted) {
                    emit({
                      type: "log",
                      status: "running",
                      path: nodePath,
                      message,
                    });
                  }
                },
              }),
            );
          }
          check();
          if (
            !outputs || typeof outputs !== "object" || Array.isArray(outputs)
          ) {
            throw new Error("Executor must return an output record");
          }
          values.set(nodeId, outputs);
          nodes[key] = { status: "completed", outputs, path: nodePath };
          emit({ type: "node", status: "completed", path: nodePath, outputs });
        } catch (error) {
          nodes[key] = {
            status: controller.signal.aborted ? "cancelled" : "failed",
            outputs: {},
            path: nodePath,
            error: error instanceof Error ? error.message : String(error),
          };
          emit({
            type: "node",
            status: nodes[key].status,
            path: nodePath,
            message: nodes[key].error,
          });
          throw error;
        }
      }
      return graphOutputs;
    };
    options.signal?.addEventListener("abort", abortFromHost, { once: true });
    if (options.signal?.aborted) abortFromHost();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort("Run timed out");
    }, Math.max(0, timeoutMs - (performance.now() - started)));
    let resolveResult!: (result: RunResult) => void;
    const result = new Promise<RunResult>((resolve) => {
      resolveResult = resolve;
    });
    const handle: RunHandle = {
      id,
      result,
      get events() {
        return [...events];
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      cancel(reason = "Run cancelled") {
        controller.abort(reason);
      },
    };
    this.active = handle;
    queueMicrotask(async () => {
      emit({ type: "run", status: "running", path: [] });
      let final: RunResult;
      try {
        check();
        const inputs = { ...options.inputs };
        for (const port of compiled.document.graphs[graphId].inputs) {
          if (
            !Object.hasOwn(inputs, port.id) &&
            port.defaultValue !== undefined
          ) {
            inputs[port.id] = port.defaultValue;
          }
          if (!Object.hasOwn(inputs, port.id) && port.required !== false) {
            throw new Error(`Missing graph input: ${port.id}`);
          }
        }
        const outputs = await executeGraph(graphId, inputs, []);
        final = {
          id,
          status: "completed",
          outputs,
          nodes,
          duration: performance.now() - started,
        };
      } catch (error) {
        const status = controller.signal.aborted && !timedOut
          ? "cancelled"
          : "failed";
        controller.abort(error);
        for (const node of Object.values(nodes)) {
          if (node.status === "pending" || node.status === "running") {
            node.status = status === "cancelled" ? "cancelled" : "skipped";
            emit({ type: "node", status: node.status, path: node.path });
          }
        }
        final = {
          id,
          status,
          outputs: {},
          nodes,
          error: error instanceof Error ? error.message : String(error),
          duration: performance.now() - started,
        };
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abortFromHost);
        this.active = null;
      }
      emit({
        type: "run",
        status: final.status,
        path: [],
        ...(final.error ? { message: final.error } : {}),
      });
      settled = true;
      resolveResult(final);
      listeners.clear();
    });
    return handle;
  }
}
