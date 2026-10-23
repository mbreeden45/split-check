import type { Diner, LineItem, TipConfig } from "./types";
import { allocate } from "./money";

export interface PortionLine {
  itemId: string;
  name: string;
  kind: LineItem["kind"];
  /** e.g. "1/3" when shared, empty when claimed in full. */
  portion: string;
  cents: number;
}

export interface DinerBreakdown {
  diner: Diner;
  lines: PortionLine[];
  foodCents: number;
  drinkCents: number;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
}

export interface SplitResult {
  diners: DinerBreakdown[];
  foodTotalCents: number;
  drinkTotalCents: number;
  itemsTotalCents: number;
  taxCents: number;
  tipCents: number;
  grandTotalCents: number;
  unassignedItems: LineItem[];
  /** Items, tax and tip that no diner is covering yet. */
  unassignedCents: number;
  /** True when tax was entered but no food exists, so tax fell back to all items. */
  taxFallback: boolean;
}

/** Effective weights for an item. Negative or non-finite weights count as zero. */
export function itemWeights(item: LineItem, diners: Diner[]): number[] {
  return diners.map((d) => {
    const w = item.shares[d.id] ?? 0;
    if (!Number.isFinite(w) || w <= 0) return 0;
    return item.mode === "equal" ? 1 : w;
  });
}

export function computeTipCents(
  tip: TipConfig,
  itemsTotalCents: number,
  taxCents: number,
): number {
  if (tip.mode === "amount") return Math.max(0, Math.round(tip.amountCents));
  const base = tip.basis === "post" ? itemsTotalCents + taxCents : itemsTotalCents;
  const pct = Number.isFinite(tip.percent) ? Math.max(0, tip.percent) : 0;
  return Math.max(0, Math.round((base * pct) / 100));
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function portionLabel(w: number, total: number): string {
  if (w === total) return "";
  if (Number.isInteger(w) && Number.isInteger(total)) {
    const g = gcd(w, total);
    return `${w / g}/${total / g}`;
  }
  return `${Math.round((w / total) * 100)}%`;
}

export function computeSplit(
  items: LineItem[],
  diners: Diner[],
  taxCents: number,
  tip: TipConfig,
): SplitResult {
  const n = diners.length;
  const food = new Array<number>(n).fill(0);
  const drink = new Array<number>(n).fill(0);
  const lines: PortionLine[][] = diners.map(() => []);
  const unassignedItems: LineItem[] = [];
  let unassignedFood = 0;
  let unassignedDrink = 0;
  let foodTotal = 0;
  let drinkTotal = 0;

  for (const item of items) {
    const price = Math.round(item.priceCents);
    if (item.kind === "food") foodTotal += price;
    else drinkTotal += price;

    const weights = itemWeights(item, diners);
    const wSum = weights.reduce((a, b) => a + b, 0);
    if (wSum <= 0) {
      unassignedItems.push(item);
      if (item.kind === "food") unassignedFood += price;
      else unassignedDrink += price;
      continue;
    }

    const parts = allocate(price, weights);
    parts.forEach((cents, i) => {
      if (weights[i] <= 0) return;
      if (item.kind === "food") food[i] += cents;
      else drink[i] += cents;
      lines[i].push({
        itemId: item.id,
        name: item.name || "Item",
        kind: item.kind,
        portion: portionLabel(weights[i], wSum),
        cents,
      });
    });
  }

  const itemsTotal = foodTotal + drinkTotal;
  const tax = Math.max(0, Math.round(taxCents));
  const tipCents = computeTipCents(tip, itemsTotal, tax);

  // Food tax lands only on food. An extra trailing bucket holds the unassigned share.
  const taxFallback = tax > 0 && foodTotal === 0;
  const taxWeights = taxFallback
    ? [...diners.map((_, i) => food[i] + drink[i]), unassignedFood + unassignedDrink]
    : [...food, unassignedFood];
  const taxParts = allocate(tax, taxWeights);

  // Tip follows each diner's full item subtotal (food plus drinks).
  const subtotals = diners.map((_, i) => food[i] + drink[i]);
  const tipParts = allocate(tipCents, [...subtotals, unassignedFood + unassignedDrink]);

  const breakdowns: DinerBreakdown[] = diners.map((diner, i) => {
    const subtotalCents = subtotals[i];
    const t = taxParts[i] ?? 0;
    const p = tipParts[i] ?? 0;
    return {
      diner,
      lines: lines[i],
      foodCents: food[i],
      drinkCents: drink[i],
      subtotalCents,
      taxCents: t,
      tipCents: p,
      totalCents: subtotalCents + t + p,
    };
  });

  const unassignedCents =
    unassignedFood + unassignedDrink + (taxParts[n] ?? 0) + (tipParts[n] ?? 0);

  return {
    diners: breakdowns,
    foodTotalCents: foodTotal,
    drinkTotalCents: drinkTotal,
    itemsTotalCents: itemsTotal,
    taxCents: tax,
    tipCents,
    grandTotalCents: itemsTotal + tax + tipCents,
    unassignedItems,
    unassignedCents,
    taxFallback,
  };
}
