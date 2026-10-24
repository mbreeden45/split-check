import type { ItemKind } from "./types";
import { toCents } from "./money";

export interface ParsedItem {
  name: string;
  qty: number;
  priceCents: number;
  kind: ItemKind;
}

export interface ParsedReceipt {
  items: ParsedItem[];
  taxCents: number | null;
  subtotalCents: number | null;
  totalCents: number | null;
  /** Tax rate printed on the receipt, e.g. 10.5 for "Tax Rate 10.5%". */
  taxRatePercent: number | null;
  /** True when the tax clearly covers drinks too, so every item was marked taxable. */
  drinksTaxed: boolean;
}

/**
 * Core line shape: optional quantity, a description, then a price with two decimals.
 * Based on `(\d+)?\s*(.+?)\s+\$?(\d+\.\d{2})`, hardened for real OCR output:
 * tolerates "2x" / "2 @" quantities, "S" read in place of "$", comma decimals, and
 * up to a few characters of trailing junk (tax flags like "T", or texture from the
 * table the receipt was photographed on).
 */
export const LINE_RE =
  /^\s*(?:(\d{1,2})\s*[xX@]?\s+)?(.+?)\s+[$S]?\s?(-?\d{1,5}[.,]\d{2})(?![\d.,])(.{0,14})$/;

/** A price alone on its line, as when the Subtotal / Tax / Total labels are hidden. */
const BARE_RE = /^\s*[$S]?\s?(\d{1,5}[.,]\d{2})(?![\d.,])(.{0,6})$/;

/** Add-on lines printed under an item, e.g. "-American Cheese 1.34" or "+ Bacon 2.00". */
const MODIFIER_RE = /^\s*[-+~=>*]+\s*[A-Za-z]/;

const TAX_RE = /\b(tax|hst|gst|vat)\b/i;
const SUBTOTAL_RE = /\bsub\s*-?\s*total\b/i;
const TOTAL_RE = /\b(total|amount\s+due|balance\s+due|balance)\b/i;
const SKIP_RE =
  /\b(tip|gratuity|change|cash|visa|master\s*card|mastercard|amex|discover|debit|credit|card|tender|payment|paid|auth|approval|approved|suggested|server|table|guests?|check\s*#|order\s*#|thank)\b|%/i;

const DRINK_RE =
  /\b(beer|ipa|bud|coors|miller|modelo|corona|pacifico|stella|guinness|heineken|michelob|pbr|yuengling|blue\s+moon|white\s+claw|truly|lager|pilsner|pils|stout|porter|ale|draft|draught|pint|can|bottle|seltzer|cider|wine|cab|cabernet|merlot|pinot|chardonnay|sauvignon|riesling|rose|prosecco|champagne|cava|sangria|margarita|marg|mojito|martini|negroni|spritz|mule|paloma|daiquiri|cocktail|old\s+fashioned|manhattan|highball|shot|shots|vodka|gin|rum|tequila|mezcal|whiskey|whisky|bourbon|scotch|rye|soda|pop|coke|diet|sprite|pepsi|ginger\s+ale|tonic|lemonade|iced\s+tea|tea|coffee|latte|espresso|cappuccino|juice|water|sparkling|kombucha|drink|bev|beverage|n\/?a\s+bev)\b/i;

export function guessKind(name: string): ItemKind {
  return DRINK_RE.test(name) ? "drink" : "food";
}

/** Fix the most common OCR confusions inside price-like tokens. */
function normalizeLine(raw: string): string {
  const line = raw.replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
  return line.replace(/(^|[\s$S])([0-9OolI]{1,5})[.,]\s?([0-9OolI]{2})(?![\w.,])/g, (m, pre, a, b) => {
    if (!/\d/.test(a + b)) return m;
    const fix = (s: string) => s.replace(/[Oo]/g, "0").replace(/[lI]/g, "1");
    return `${pre}${fix(a)}.${fix(b)}`;
  });
}

/** Up to 14 trailing characters after the price are noise, unless they hold another price. */
function isJunkTail(tail: string): boolean {
  return !/\d[.,]\d{2}/.test(tail);
}

const PLAUSIBLE_TAX = 0.13;

/**
 * Decide whether the printed tax was charged on drinks too. Uses the printed rate
 * when there is one, otherwise whether tax on food alone would be an implausible rate.
 */
function taxCoversDrinks(taxCents: number, foodCents: number, allCents: number, ratePercent: number | null): boolean {
  if (taxCents <= 0 || allCents <= foodCents) return false;
  if (foodCents <= 0) return true;
  if (ratePercent !== null && ratePercent > 0) {
    const r = ratePercent / 100;
    return Math.abs(allCents * r - taxCents) < Math.abs(foodCents * r - taxCents);
  }
  return taxCents / foodCents > PLAUSIBLE_TAX && taxCents / allCents <= PLAUSIBLE_TAX;
}

function cleanName(name: string): string {
  return name
    .replace(/[.\-_=:~]{2,}/g, " ")
    .replace(/^[^A-Za-z0-9(]+/, "")
    .replace(/[^A-Za-z0-9)%!]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseReceiptText(text: string): ParsedReceipt {
  const out: ParsedReceipt = {
    items: [],
    taxCents: null,
    subtotalCents: null,
    totalCents: null,
    taxRatePercent: null,
    drinksTaxed: false,
  };

  // Every amount in reading order, so an unlabeled totals block can be found afterwards.
  const amounts: { cents: number; itemsBefore: number }[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = normalizeLine(raw);
    if (line.length < 4) continue;
    const bare = BARE_RE.exec(line);
    if (bare && isJunkTail(bare[2])) {
      const cents = toCents(bare[1]);
      if (cents !== null) amounts.push({ cents, itemsBefore: out.items.length });
      continue;
    }
    const m = LINE_RE.exec(line);
    if (!m) continue;

    const [, qtyStr, rawName, priceStr, tail] = m;
    if (!isJunkTail(tail)) continue;
    const priceCents = toCents(priceStr);
    if (priceCents === null) continue;
    const name = cleanName(rawName);
    amounts.push({ cents: priceCents, itemsBefore: out.items.length });

    if (SUBTOTAL_RE.test(name)) {
      out.subtotalCents = priceCents;
      continue;
    }
    if (TAX_RE.test(name)) {
      out.taxCents = (out.taxCents ?? 0) + priceCents;
      const rate = /(\d{1,2}(?:\.\d{1,3})?)\s*%/.exec(name);
      if (rate && out.taxRatePercent === null) out.taxRatePercent = parseFloat(rate[1]);
      continue;
    }
    if (TOTAL_RE.test(name)) {
      out.totalCents = priceCents;
      // Payment lines, tax summaries and discounts follow. Nothing after this is an item.
      break;
    }
    if (SKIP_RE.test(name)) continue;
    if (!/[A-Za-z]{2,}/.test(name)) continue;
    if (priceCents === 0) continue;

    const prev = out.items[out.items.length - 1];
    if (MODIFIER_RE.test(raw) && prev) {
      prev.priceCents += priceCents;
      continue;
    }

    const qty = qtyStr ? Math.max(1, parseInt(qtyStr, 10)) : 1;
    out.items.push({ name, qty, priceCents, kind: guessKind(name) });
  }

  if (out.subtotalCents === null) findUnlabeledTotals(out, amounts);

  if (out.taxCents !== null) {
    const all = out.items.reduce((a, i) => a + i.priceCents, 0);
    const food = out.items.filter((i) => i.kind === "food").reduce((a, i) => a + i.priceCents, 0);
    if (taxCoversDrinks(out.taxCents, food, all, out.taxRatePercent)) {
      out.drinksTaxed = true;
      for (const i of out.items) i.kind = "food";
    }
  }

  return out;
}

/**
 * When a card or thumb hides the labels, the totals block still has a shape: a line equal
 * to the sum of every item above it (subtotal), then tax, then a total equal to the two
 * added together. Anything after the subtotal is not an item.
 */
function findUnlabeledTotals(out: ParsedReceipt, amounts: { cents: number; itemsBefore: number }[]) {
  const sumOf = (n: number) => out.items.slice(0, n).reduce((a, i) => a + i.priceCents, 0);
  const at = amounts.findIndex((a) => a.itemsBefore >= 2 && Math.abs(a.cents - sumOf(a.itemsBefore)) <= 1);
  if (at < 0) return;
  const subtotal = amounts[at];
  out.items = out.items.slice(0, subtotal.itemsBefore);
  out.subtotalCents = subtotal.cents;

  const next = amounts[at + 1];
  const after = amounts[at + 2];
  if (next && after && Math.abs(subtotal.cents + next.cents - after.cents) <= 1) {
    out.taxCents = next.cents;
    out.totalCents = after.cents;
  } else if (next && next.cents > subtotal.cents && next.cents - subtotal.cents <= subtotal.cents * 0.15) {
    out.totalCents = next.cents;
    out.taxCents = next.cents - subtotal.cents;
  }
}
