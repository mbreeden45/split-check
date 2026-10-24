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

/** Receipt width handed to the reader. Small print needs room; more only costs time. */
const TARGET_WIDTH = 1400;

/**
 * Crop the photo to the receipt and scale it so the print is large enough to read.
 * Receipts photographed from across the table can fill a third of the frame.
 */
async function receiptImage(file: Blob): Promise<ImageBitmap> {
  const photo = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { findPaper } = await import("./ocr");
    const [x0, y0, x1, y1] = findPaper(photo);
    const cw = x1 - x0;
    const ch = y1 - y0;
    let scale = Math.min(4, TARGET_WIDTH / cw);
    if (cw * ch * scale * scale > TARGET_WIDTH * 6000) scale = Math.sqrt((TARGET_WIDTH * 6000) / (cw * ch));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(cw * scale));
    canvas.height = Math.max(1, Math.round(ch * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return photo;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(photo, x0, y0, cw, ch, 0, 0, canvas.width, canvas.height);
    photo.close();
    const out = await createImageBitmap(canvas);
    canvas.width = canvas.height = 0;
    return out;
  } catch {
    return photo;
  }
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
  const image = await receiptImage(file);
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
