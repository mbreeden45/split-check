"use client";

import type { OcrProgress } from "./ocr";
import type { PaddleRequest, PaddleResponse } from "./paddle.worker";

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL("./paddle.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

/** Stop the worker; the next read starts a fresh one (models come back from the browser cache). */
function resetWorker() {
  worker?.terminate();
  worker = null;
}

/** Read a receipt photo with PaddleOCR in a worker. Rejects if this browser can't run it. */
export async function recognizeWithPaddle(
  file: Blob,
  onProgress: (p: OcrProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    throw new Error("This browser can't run the on-device reader.");
  }
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  const w = getWorker();
  const id = nextId++;

  return new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onMessage = (e: MessageEvent<PaddleResponse>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === "progress") onProgress({ status: m.status, progress: m.progress });
      else {
        cleanup();
        if (m.type === "result") resolve(m.text);
        else reject(new Error(m.message));
      }
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      resetWorker();
      reject(new Error(e.message || "The on-device reader failed to start."));
    };
    const onAbort = () => {
      cleanup();
      resetWorker();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    w.postMessage({ type: "recognize", id, image } satisfies PaddleRequest, [image]);
  });
}
