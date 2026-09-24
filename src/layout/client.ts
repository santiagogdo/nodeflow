import { uniqueId } from "../core/types.ts";
import type {
  LayoutInput,
  LayoutOptions,
  LayoutResult,
  LayoutWorkerRequest,
  LayoutWorkerResponse,
} from "./types.ts";

/** Structural worker interface keeps the ordinary layout entry usable without DOM typings. */
export interface LayoutWorker {
  postMessage(message: LayoutWorkerRequest): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
  terminate(): void;
}
export function layoutWithWorker(
  createWorker: () => LayoutWorker,
  input: LayoutInput,
  options: LayoutOptions = {},
): Promise<LayoutResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(options.signal.reason);
      return;
    }
    const worker = createWorker(),
      id = uniqueId("layout");
    const cleanup = () => {
      options.signal?.removeEventListener("abort", cancel);
      worker.removeEventListener("message", message);
      worker.removeEventListener("error", error);
      worker.terminate();
    };
    const cancel = () => {
      cleanup();
      reject(options.signal?.reason ?? new Error("Layout cancelled"));
    };
    const error = (event: { message?: string }) => {
      cleanup();
      reject(new Error(event.message ?? "Layout worker failed"));
    };
    const message = (event: { data: LayoutWorkerResponse }) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
      else reject(new Error("Invalid layout response"));
    };
    worker.addEventListener("message", message);
    worker.addEventListener("error", error);
    options.signal?.addEventListener("abort", cancel, { once: true });
    const { signal: _, ...settings } = options;
    try {
      worker.postMessage({ id, input, options: settings });
    } catch (cause) {
      cleanup();
      reject(cause);
    }
  });
}
