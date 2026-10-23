"use client";

export interface OcrProgress {
  status: string;
  /** 0 to 1 */
  progress: number;
}

const MAX_EDGE = 2200;

/**
 * Draw the photo to an in-memory canvas and clean it up for Tesseract:
 * 1. Crop to the paper. Receipts are bright and colorless, tables usually are not,
 *    and wood grain or fabric otherwise turns into junk characters.
 * 2. Flatten lighting by dividing each pixel by its local average, which removes
 *    phone shadows and uneven thermal paper without losing faint ink.
 * Nothing leaves the device. Kept self-contained so it can run in a test harness.
 */
async function preprocess(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const sw = Math.max(1, Math.round(bitmap.width * scale));
  const sh = Math.max(1, Math.round(bitmap.height * scale));
  const src = document.createElement("canvas");
  src.width = sw;
  src.height = sh;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) {
    bitmap.close();
    throw new Error("Canvas is not available in this browser.");
  }
  sctx.drawImage(bitmap, 0, 0, sw, sh);
  bitmap.close();
  const rgba = sctx.getImageData(0, 0, sw, sh).data;
  src.width = src.height = 0;

  // Paper mask: low chroma and not dark.
  const paper = new Uint8Array(sw * sh);
  const gray = new Float32Array(sw * sh);
  for (let i = 0, k = 0; i < paper.length; i++, k += 4) {
    const r = rgba[k];
    const g = rgba[k + 1];
    const b = rgba[k + 2];
    gray[i] = (r * 299 + g * 587 + b * 114) / 1000;
    paper[i] = Math.max(r, g, b) - Math.min(r, g, b) < 38 && gray[i] > 90 ? 1 : 0;
  }

  // Longest run of columns (then rows) that are mostly paper.
  const longestRun = (len: number, isPaper: (i: number) => boolean): [number, number] => {
    let best: [number, number] = [0, len];
    let bestLen = 0;
    let start = -1;
    for (let i = 0; i <= len; i++) {
      if (i < len && isPaper(i)) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        if (i - start > bestLen) {
          bestLen = i - start;
          best = [start, i];
        }
        start = -1;
      }
    }
    return bestLen > len * 0.25 ? best : [0, len];
  };
  const colFrac = (x: number, y0: number, y1: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) n += paper[y * sw + x];
    return n / Math.max(1, y1 - y0);
  };
  const rowFrac = (y: number, x0: number, x1: number) => {
    let n = 0;
    for (let x = x0; x < x1; x++) n += paper[y * sw + x];
    return n / Math.max(1, x1 - x0);
  };
  let [x0, x1] = longestRun(sw, (x) => colFrac(x, 0, sh) > 0.5);
  const [y0, y1] = longestRun(sh, (y) => rowFrac(y, x0, x1) > 0.6);
  [x0, x1] = longestRun(sw, (x) => colFrac(x, y0, y1) > 0.6);
  // Small margin so edge characters survive.
  const pad = Math.round(Math.max(sw, sh) * 0.01);
  x0 = Math.max(0, x0 - pad);
  x1 = Math.min(sw, x1 + pad);
  const cy0 = Math.max(0, y0 - pad);
  const cy1 = Math.min(sh, y1 + pad);
  const w = x1 - x0;
  const h = cy1 - cy0;

  // Integral image of the crop for fast local means.
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[(y + cy0) * sw + x + x0];
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.max(w, h) / 40));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  const out = ctx.createImageData(w, h);
  const d = out.data;
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r);
    const yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r);
      const xb = Math.min(w, x + r + 1);
      const mean = (sum[yb * W + xb] - sum[ya * W + xb] - sum[yb * W + xa] + sum[ya * W + xa]) / ((xb - xa) * (yb - ya));
      const v = Math.max(0, Math.min(255, (gray[(y + cy0) * sw + x + x0] / Math.max(1, mean)) * 255 - 20));
      const k = (y * w + x) * 4;
      d[k] = d[k + 1] = d[k + 2] = v;
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

const STATUS_LABELS: Record<string, string> = {
  "loading tesseract core": "Loading OCR engine",
  "initializing tesseract": "Starting OCR engine",
  "initialized tesseract": "OCR engine ready",
  "loading language traineddata": "Loading English model",
  "loaded language traineddata": "English model ready",
  "initializing api": "Warming up",
  "initialized api": "Warming up",
  "recognizing text": "Reading receipt",
};

/** Run OCR fully in the browser. tesseract.js is imported on demand to keep the first load light. */
export async function recognizeReceipt(
  file: Blob,
  onProgress: (p: OcrProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  onProgress({ status: "Preparing photo", progress: 0 });
  const [canvas, Tesseract] = await Promise.all([preprocess(file), import("tesseract.js")]);
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");

  const worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
    logger: (m) => {
      onProgress({ status: STATUS_LABELS[m.status] ?? "Working", progress: m.progress ?? 0 });
    },
  });
  const abort = () => void worker.terminate().catch(() => {});
  signal?.addEventListener("abort", abort, { once: true });

  try {
    // A single uniform block keeps each price on the same line as its description.
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
    const { data } = await worker.recognize(canvas);
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    return data.text ?? "";
  } finally {
    signal?.removeEventListener("abort", abort);
    canvas.width = canvas.height = 0;
    await worker.terminate().catch(() => {});
  }
}
