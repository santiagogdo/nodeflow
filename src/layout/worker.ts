import { layoutGraph } from "./algorithm.ts";
import type { LayoutWorkerRequest, LayoutWorkerResponse } from "./types.ts";
const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<LayoutWorkerRequest>) => void) | null;
  postMessage(message: LayoutWorkerResponse): void;
};
worker.onmessage = ({ data }) => {
  try {
    worker.postMessage({
      id: data.id,
      result: layoutGraph(data.input, data.options),
    });
  } catch (error) {
    worker.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
