"use client";

export interface OcrProgress {
  status: string;
  /** 0 to 1 */
  progress: number;
}

const MAX_EDGE = 2200;

/**
 * Draw the photo to an in-memory canvas: downscale, grayscale and stretch contrast.
 * Receipts are thermal paper with faint ink, so this noticeably improves Tesseract accuracy.
 * Nothing leaves the device.
 */
async function preprocess(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas is not available in this browser.");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = g;
    hist[g | 0]++;
  }
  // Clip the darkest and lightest 1% then stretch.
  const total = w * h;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.01; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.01; hi--);
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
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
