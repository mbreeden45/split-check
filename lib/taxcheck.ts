import type { LineItem } from "./types";
import { guessKind } from "./parser";

/**
 * Combined US sales tax on restaurant bills sits in a narrow band. Anything well outside
 * it means the Taxable / Tax Included marks don't match how the receipt was taxed.
 */
export const RATE_MIN = 0.055;
export const RATE_MAX = 0.12;

/** Brute force is instant up to this many items; beyond it only the name heuristic runs. */
const MAX_SEARCH_ITEMS = 16;

export interface TaxSuggestion {
  /** Items that should be Tax Included. Every other item should be Taxable. */
  includedIds: string[];
  /** Items whose mark would change if the suggestion is applied. */
  changedIds: string[];
  /** Which way the changed items flip: to Tax Included, to Taxable, or some of each. */
  direction: "included" | "taxable" | "mixed";
}

export interface TaxInsight {
  /** Tax divided by the items currently marked Taxable. Null when there's nothing to divide. */
  rate: number | null;
  status: "ok" | "low" | "high" | "none";
  message: string | null;
  suggestion: TaxSuggestion | null;
}

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

function describe(items: LineItem[]): string {
  const counts = new Map<string, number>();
  for (const i of items) {
    const n = i.name.trim() || "Untitled item";
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const parts = [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n));
  if (parts.length <= 3) return parts.join(", ");
  return `${parts.slice(0, 2).join(", ")} and ${parts.length - 2} more`;
}

function suggestionFor(items: LineItem[], included: Set<string>): TaxSuggestion | null {
  const changed = items.filter((i) => (i.kind === "drink") !== included.has(i.id));
  if (changed.length === 0) return null;
  return {
    includedIds: [...included],
    changedIds: changed.map((i) => i.id),
    direction: changed.every((i) => included.has(i.id))
      ? "included"
      : changed.every((i) => !included.has(i.id))
        ? "taxable"
        : "mixed",
  };
}

/**
 * With a printed rate, the taxed amount is tax / rate, so the tax-included items must
 * add up to the rest. Find the one set of items that does, preferring sets made only of
 * drinks. Returns null when no set fits or the answer is ambiguous.
 */
function findIncludedSet(items: LineItem[], untaxedTarget: number, tolerance: number): Set<string> | null {
  if (items.length > MAX_SEARCH_ITEMS) return null;
  const drinky = items.map((i) => guessKind(i.name) === "drink");
  const matches = new Map<string, { mask: number; allDrinks: boolean; error: number }>();
  for (let mask = 0; mask < 1 << items.length; mask++) {
    let sum = 0;
    let allDrinks = true;
    const sig: string[] = [];
    for (let k = 0; k < items.length; k++) {
      if (!(mask & (1 << k))) continue;
      sum += items[k].priceCents;
      if (!drinky[k]) allDrinks = false;
      sig.push(`${items[k].name.trim().toLowerCase()}|${items[k].priceCents}`);
    }
    const error = Math.abs(sum - untaxedTarget);
    if (error > tolerance) continue;
    // Identical lines (three of the same cider) are interchangeable, so compare by content.
    const key = sig.sort().join(";");
    const prev = matches.get(key);
    if (!prev || error < prev.error) matches.set(key, { mask, allDrinks, error });
  }
  let pool = [...matches.values()];
  if (pool.some((m) => m.allDrinks)) pool = pool.filter((m) => m.allDrinks);
  if (pool.length !== 1) return null;
  const { mask } = pool[0];
  return new Set(items.filter((_, k) => mask & (1 << k)).map((i) => i.id));
}

/** How far the actual rate may sit from an expected one: printed rates get rounded or misprinted. */
const RATE_TOLERANCE = 0.07;

/**
 * @param printedRatePercent rate printed on the receipt, if any
 * @param typicalRatePercent rate from this person's recent checks, used when nothing is printed
 */
export function analyzeTax(
  items: LineItem[],
  taxCents: number,
  printedRatePercent: number | null,
  typicalRatePercent: number | null = null,
): TaxInsight {
  const priced = items.filter((i) => i.priceCents > 0);
  const all = priced.reduce((a, i) => a + i.priceCents, 0);
  const taxable = priced.filter((i) => i.kind === "food").reduce((a, i) => a + i.priceCents, 0);
  if (taxCents <= 0 || all <= 0) return { rate: null, status: "none", message: null, suggestion: null };

  const rate = taxable > 0 ? taxCents / taxable : null;
  const printed = printedRatePercent && printedRatePercent > 0 ? printedRatePercent / 100 : null;
  const typical = typicalRatePercent && typicalRatePercent > 0 ? typicalRatePercent / 100 : null;
  const expected = printed ?? typical;
  // Rates accepted as normal for this bill.
  const lo = expected ? expected * (1 - RATE_TOLERANCE) : RATE_MIN;
  const hi = expected ? expected * (1 + RATE_TOLERANCE) : RATE_MAX;
  const inBand = (r: number) => r >= lo && r <= hi;
  // Per-line rounding lets tax drift by about half a cent per line.
  const taxSlack = 0.5 * (priced.length + 1);

  const status: TaxInsight["status"] = rate === null || rate > hi ? "high" : rate < lo ? "low" : "ok";
  if (status === "ok") return { rate, status, message: null, suggestion: null };

  let included: Set<string> | null = null;
  let untaxedTarget: number | null = null;
  if (expected !== null) {
    // The taxed amount is tax / rate, so the tax-included items add up to the rest.
    untaxedTarget = Math.max(0, Math.round(all - taxCents / expected));
    // Exact rounding slack first; widen only if the rate itself looks rounded.
    included =
      findIncludedSet(priced, untaxedTarget, Math.ceil(taxSlack / expected)) ??
      findIncludedSet(priced, untaxedTarget, Math.ceil(taxSlack / expected + all * 0.02));
  }
  if (!included && status === "low") {
    // Assume drinks are the tax-included ones and check that the rate becomes normal.
    const set = new Set(priced.filter((i) => i.kind === "drink" || guessKind(i.name) === "drink").map((i) => i.id));
    const rest = priced.filter((i) => !set.has(i.id)).reduce((a, i) => a + i.priceCents, 0);
    if (set.size > 0 && rest > 0 && inBand(taxCents / rest)) included = set;
  } else if (!included && status === "high" && inBand(taxCents / all)) {
    // Too high for the taxable items alone but normal across everything: it was all taxed.
    included = new Set();
  }

  const suggestion = included ? suggestionFor(priced, included) : null;
  const changed = suggestion ? priced.filter((i) => suggestion.changedIds.includes(i.id)) : [];
  const rateText = rate === null ? "" : `Tax is ${pct(rate)} of the taxable items, `;

  let message: string;
  if (status === "low") {
    message = `${rateText || "Tax is "}lower than ${printed ? `the ${pct(printed)} printed on the receipt` : typical ? `your usual ${pct(typical)}` : "any real sales tax"}. `;
    if (suggestion?.direction === "included") {
      message += `${describe(changed)} (${dollars(changed.reduce((a, i) => a + i.priceCents, 0))}) probably already include${changed.length === 1 ? "s" : ""} tax.`;
    } else if (untaxedTarget) {
      message += `About ${dollars(untaxedTarget)} of items probably already include tax, usually drinks.`;
    } else {
      message += "Some items, usually drinks, probably already include tax.";
    }
  } else {
    message = rate === null
      ? "There's tax on this receipt but every item is marked Tax Included. "
      : `${rateText}higher than ${printed ? `the ${pct(printed)} printed on the receipt` : typical ? `your usual ${pct(typical)}` : "any real sales tax"}. `;
    if (suggestion?.direction === "taxable") {
      message += `${describe(changed)} ${changed.length === 1 ? "was" : "were"} probably taxed too.`;
    } else {
      message += "Some Tax Included items were probably taxed too.";
    }
  }

  return { rate, status, message, suggestion };
}
