/** Parse a user or OCR supplied money string into integer cents. Returns null when unparseable. */
export function toCents(input: string | number): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  const cleaned = input.replace(/[^0-9.,-]/g, "").replace(/,(\d{2})$/, ".$1").replace(/,/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** Cents as a plain editable string, e.g. 1250 -> "12.50". */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Split `total` cents across `weights` so the parts sum exactly to `total`.
 * Uses the largest remainder method; ties go to the earlier index.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = weights.map((w) => (Math.max(0, w) / sum) * abs);
  const parts = raw.map(Math.floor);
  let left = abs - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .filter(({ i }) => weights[i] > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) {
    parts[order[k].i] += 1;
  }
  return parts.map((p) => p * sign);
}
