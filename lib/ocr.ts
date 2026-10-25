"use client";

export interface OcrProgress {
  status: string;
  /** 0 to 1 */
  progress: number;
}

/** Paper detection runs on a small copy; it only needs the outline. */
const DETECT_EDGE = 1000;
/**
 * Width the receipt is scaled to before OCR. A 3 inch receipt at 300 dpi is ~900 px;
 * a bit more keeps small print legible. Tesseract reads best with letters 20 to 30 px tall,
 * and receipts photographed at arm's length often arrive at a third of that.
 */
const TARGET_WIDTH = 1400;
const MAX_SCALE = 4;
const MAX_PIXELS = 1400 * 6000;

/**
 * Turn the photo into a clean, OCR-sized grayscale canvas, entirely in memory:
 * 1. Find the paper on a small copy. Receipts are bright and colorless, tables usually
 *    are not, and wood grain or fabric otherwise turns into junk characters.
 * 2. Cut that region from the full-resolution photo and scale it to TARGET_WIDTH.
 * 3. Flatten lighting by dividing each pixel by its local average, which removes
 *    phone shadows and uneven thermal paper without losing faint ink.
 * Nothing leaves the device. Kept self-contained so it can run in a test harness.
 */
async function preprocess(file: Blob, crop = true, deskew = true): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const [x0, y0, x1, y1] = crop ? findPaper(bitmap) : [0, 0, bitmap.width, bitmap.height];
    const cw = x1 - x0;
    const ch = y1 - y0;
    let scale = Math.min(MAX_SCALE, TARGET_WIDTH / cw);
    if (cw * ch * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (cw * ch));
    const w = Math.max(1, Math.round(cw * scale));
    const h = Math.max(1, Math.round(ch * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, x0, y0, cw, ch, 0, 0, w, h);

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const gray = new Float32Array(w * h);
    for (let i = 0, k = 0; i < gray.length; i++, k += 4) gray[i] = (d[k] * 299 + d[k + 1] * 587 + d[k + 2] * 114) / 1000;

    // Integral image for fast local means.
    const W = w + 1;
    const sum = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += gray[y * w + x];
        sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row;
      }
    }
    const r = Math.max(8, Math.round(Math.max(w, h) / 40));
    for (let y = 0; y < h; y++) {
      const ya = Math.max(0, y - r);
      const yb = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const xa = Math.max(0, x - r);
        const xb = Math.min(w, x + r + 1);
        const mean = (sum[yb * W + xb] - sum[ya * W + xb] - sum[yb * W + xa] + sum[ya * W + xa]) / ((xb - xa) * (yb - ya));
        // Paper sits near 1.0 of its surroundings and ink well below; stretch that gap to black on white.
        const v = Math.max(0, Math.min(255, 255 - (1 - gray[y * w + x] / Math.max(1, mean)) * 510));
        const k = (y * w + x) * 4;
        d[k] = d[k + 1] = d[k + 2] = v;
        d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (!deskew) return canvas;
    const angle = skewAngle(d, w, h);
    if (Math.abs(angle) < 0.4) return canvas;
    // Rotate onto a white canvas so the corners don't read as ink.
    // skewAngle reports the correction directly: rotating by it levels the lines.
    const rad = (angle * Math.PI) / 180;
    const rw = Math.ceil(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
    const rh = Math.ceil(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));
    const out = document.createElement("canvas");
    out.width = rw;
    out.height = rh;
    const octx = out.getContext("2d");
    if (!octx) return canvas;
    octx.fillStyle = "#fff";
    octx.fillRect(0, 0, rw, rh);
    octx.translate(rw / 2, rh / 2);
    octx.rotate(rad);
    octx.drawImage(canvas, -w / 2, -h / 2);
    canvas.width = canvas.height = 0;
    return out;
  } finally {
    bitmap.close();
  }
}

/**
 * Text tilt in degrees, found by trying angles and keeping the one where ink pixels stack
 * into the sharpest horizontal rows. Tilted lines make Tesseract pair prices with the wrong item.
 */
function skewAngle(rgba: Uint8ClampedArray, w: number, h: number): number {
  const step = Math.max(1, Math.round(w / 500));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (rgba[(y * w + x) * 4] < 110) {
        xs.push(x - w / 2);
        ys.push(y);
      }
    }
  }
  if (xs.length < 200) return 0;
  const bin = Math.max(2, step * 2);
  const bins = Math.ceil((h + w) / bin) + 2;
  const hist = new Float64Array(bins);
  let best = 0;
  let bestScore = -1;
  for (let a = -8; a <= 8.001; a += 0.25) {
    const t = Math.tan((a * Math.PI) / 180);
    hist.fill(0);
    for (let i = 0; i < xs.length; i++) {
      const b = Math.floor((ys[i] + xs[i] * t + w) / bin);
      if (b >= 0 && b < bins) hist[b]++;
    }
    let score = 0;
    for (let i = 0; i < bins; i++) score += hist[i] * hist[i];
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/**
 * Box around the printed text on a small image: pixels clearly darker than their surroundings,
 * trimmed to the 1st to 99th percentile so stray specks don't stretch it.
 */
function inkBox(rgba: Uint8ClampedArray, w: number, h: number): [number, number, number, number] | null {
  const gray = new Float32Array(w * h);
  for (let i = 0, k = 0; i < gray.length; i++, k += 4) gray[i] = (rgba[k] * 299 + rgba[k + 1] * 587 + rgba[k + 2] * 114) / 1000;
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row;
    }
  }
  const r = Math.max(4, Math.round(Math.max(w, h) / 60));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r);
    const yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r);
      const xb = Math.min(w, x + r + 1);
      const mean = (sum[yb * W + xb] - sum[ya * W + xb] - sum[yb * W + xa] + sum[ya * W + xa]) / ((xb - xa) * (yb - ya));
      const g = gray[y * w + x];
      if (g < mean * 0.78 && g < 170) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length < 100) return null;
  const pct = (a: number[], p: number) => a.sort((m, n) => m - n)[Math.floor((a.length - 1) * p)];
  const box: [number, number, number, number] = [pct(xs, 0.01), pct(ys, 0.01), pct(xs, 0.99) + 1, pct(ys, 0.99) + 1];
  return (box[2] - box[0]) * (box[3] - box[1]) < w * h * 0.8 ? box : null;
}

/** Bounding box of the receipt paper in full-resolution pixels: [x0, y0, x1, y1]. */
export function findPaper(bitmap: ImageBitmap): [number, number, number, number] {
  const scale = Math.min(1, DETECT_EDGE / Math.max(bitmap.width, bitmap.height));
  const sw = Math.max(1, Math.round(bitmap.width * scale));
  const sh = Math.max(1, Math.round(bitmap.height * scale));
  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  if (!sctx) return [0, 0, bitmap.width, bitmap.height];
  sctx.drawImage(bitmap, 0, 0, sw, sh);
  const rgba = sctx.getImageData(0, 0, sw, sh).data;
  small.width = small.height = 0;

  // Paper mask: low chroma and not dark.
  const paper = new Uint8Array(sw * sh);
  for (let i = 0, k = 0; i < paper.length; i++, k += 4) {
    const r = rgba[k];
    const g = rgba[k + 1];
    const b = rgba[k + 2];
    const gray = (r * 299 + g * 587 + b * 114) / 1000;
    paper[i] = Math.max(r, g, b) - Math.min(r, g, b) < 38 && gray > 90 ? 1 : 0;
  }

  // Longest run of indexes that pass: the receipt is one vertical strip of paper.
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
  // First to last index that passes. Tolerates gaps, such as a card, a thumb or a fold
  // lying across the receipt.
  const span = (len: number, isPaper: (i: number) => boolean): [number, number] => {
    let first = -1;
    let last = -1;
    for (let i = 0; i < len; i++) {
      if (!isPaper(i)) continue;
      if (first < 0) first = i;
      last = i;
    }
    return first >= 0 && last - first > len * 0.25 ? [first, last + 1] : [0, len];
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
  let [y0, y1] = span(sh, (y) => rowFrac(y, x0, x1) > 0.6);
  [x0, x1] = longestRun(sw, (x) => colFrac(x, y0, y1) > 0.5);
  // Generous margin: tilted or curled edges otherwise lose their first letters.
  let pad = Math.round(Math.max(sw, sh) * 0.03);

  // On a pale, plain table the paper test passes everywhere. Fall back to where the text is.
  if ((x1 - x0) * (y1 - y0) > sw * sh * 0.8) {
    const box = inkBox(rgba, sw, sh);
    if (box) {
      [x0, y0, x1, y1] = box;
      pad = Math.round(Math.max(sw, sh) * 0.04);
    }
  }
  // Small margin so edge characters survive, then back to full-resolution pixels.
  const toFull = (v: number) => Math.round(v / scale);
  return [
    toFull(Math.max(0, x0 - pad)),
    toFull(Math.max(0, y0 - pad)),
    Math.min(bitmap.width, toFull(Math.min(sw, x1 + pad))),
    Math.min(bitmap.height, toFull(Math.min(sh, y1 + pad))),
  ];
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

/**
 * Run OCR fully in the browser. tesseract.js is imported on demand to keep the first load light.
 * The photo is cropped to the paper first. If `score` says that read isn't trustworthy
 * (below `minScore`, e.g. the items don't add up to the subtotal), it reads the whole photo
 * again and keeps whichever text scored higher.
 */
export async function recognizeReceipt(
  file: Blob,
  onProgress: (p: OcrProgress) => void,
  signal?: AbortSignal,
  score?: (text: string) => number,
  minScore = 2,
): Promise<string> {
  onProgress({ status: "Preparing photo", progress: 0 });
  const [canvas, Tesseract] = await Promise.all([preprocess(file), import("tesseract.js")]);
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");

  let pass = 1;
  const worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
    logger: (m) => {
      const status = STATUS_LABELS[m.status] ?? "Working";
      onProgress({ status: pass > 1 && m.status === "recognizing text" ? "Reading again without cropping" : status, progress: m.progress ?? 0 });
    },
  });
  const abort = () => void worker.terminate().catch(() => {});
  signal?.addEventListener("abort", abort, { once: true });

  const read = async (c: HTMLCanvasElement) => {
    const { data } = await worker.recognize(c);
    c.width = c.height = 0;
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    return data.text ?? "";
  };

  try {
    // A single uniform block keeps each price on the same line as its description.
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
    const first = await read(canvas);
    if (!score || score(first) >= minScore) return first;
    pass = 2;
    const second = await read(await preprocess(file, false));
    return score(second) > score(first) ? second : first;
  } finally {
    signal?.removeEventListener("abort", abort);
    await worker.terminate().catch(() => {});
  }
}
