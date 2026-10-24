/// <reference lib="webworker" />
// PaddleOCR (PP-OCRv5, English) running entirely in this browser tab, off the main thread.
// Models and the ONNX Runtime WebAssembly are served from this site; nothing is uploaded.

import * as ort from "onnxruntime-web";
import { PaddleOcrService } from "ppu-paddle-ocr/web";

export type PaddleRequest = { type: "recognize"; id: number; image: ImageBitmap };
export type PaddleResponse =
  | { type: "progress"; id: number; status: string; progress: number }
  | { type: "result"; id: number; text: string }
  | { type: "error"; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ort.env.wasm.wasmPaths = "/ort/";

const MODELS = [
  { url: "/models/det.ort", bytes: 4_896_928 },
  { url: "/models/rec-en.ort", bytes: 7_962_368 },
  { url: "/models/dict-en.txt", bytes: 1_417 },
];

/** Longest side handed to OCR. Larger costs time without helping a receipt. */
const MAX_SIDE = 2400;

let service: Promise<PaddleOcrService> | null = null;

async function download(onProgress: (fraction: number) => void): Promise<ArrayBuffer[]> {
  const total = MODELS.reduce((a, m) => a + m.bytes, 0);
  const loaded = MODELS.map(() => 0);
  return Promise.all(
    MODELS.map(async (m, i) => {
      const res = await fetch(m.url);
      if (!res.ok || !res.body) throw new Error(`Could not load ${m.url}`);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded[i] += value.length;
        onProgress(Math.min(1, loaded.reduce((a, b) => a + b, 0) / total));
      }
      const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
      let off = 0;
      for (const c of chunks) {
        out.set(c, off);
        off += c.length;
      }
      return out.buffer;
    }),
  );
}

function getService(id: number): Promise<PaddleOcrService> {
  if (!service) {
    service = (async () => {
      const [detection, recognition, charactersDictionary] = await download((p) =>
        ctx.postMessage({ type: "progress", id, status: "Downloading reader", progress: p } satisfies PaddleResponse),
      );
      ctx.postMessage({ type: "progress", id, status: "Starting reader", progress: 1 } satisfies PaddleResponse);
      const s = new PaddleOcrService({ model: { detection, recognition, charactersDictionary } });
      await s.initialize();
      return s;
    })();
    service.catch(() => (service = null));
  }
  return service;
}

ctx.onmessage = async (e: MessageEvent<PaddleRequest>) => {
  const { id, image } = e.data;
  try {
    const ocr = await getService(id);
    ctx.postMessage({ type: "progress", id, status: "Reading receipt", progress: 0.5 } satisfies PaddleResponse);
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const canvas = new OffscreenCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    const result = await ocr.recognize(canvas as unknown as HTMLCanvasElement);
    ctx.postMessage({ type: "result", id, text: result.text ?? "" } satisfies PaddleResponse);
  } catch (err) {
    ctx.postMessage({ type: "error", id, message: err instanceof Error ? err.message : String(err) } satisfies PaddleResponse);
  }
};
