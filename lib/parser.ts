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
 * Based on `(\d+)?\s*(.+?)\s+\$?(\d+\.\d{2})`, hardened for real receipts and OCR:
 * - "2x" / "2 @" quantities, "S" read in place of "$", comma decimals
 * - the last price on the line wins, so "Dinner $29.88 29.88" (unit, total) reads the total
 * - discounts as "(8.99)" or "-$17.95"
 * - up to a few characters of trailing junk (tax flags like "T", table texture)
 */
export const LINE_RE =
  /^\s*(?:(\d{1,2})\s*[xX@]?\s+)?(.*\S)\s+(\(?-?[$S]?\s?-?\d{0,5}[.,]\d{2}\)?)(?![\d.,])(.{0,14})$/;

/** A price alone on its line, as when the Subtotal / Tax / Total labels are hidden. */
const BARE_RE = /^\s*(\(?-?[$S]?\s?-?\d{0,5}[.,]\d{2}\)?)(?![\d.,])(.{0,6})$/;

/** Retail style columns: "100027 1 5.25 5.25" with the description on the next line. */
const SKU_RE = /^\s*\d{3,}\s+(\d{1,3})\s+\$?\d{1,5}[.,]\d{2}\s+\$?(\d{1,5}[.,]\d{2})\s*$/;

/** Add-on lines printed under an item, e.g. "-American Cheese 1.34" or "+ Bacon 2.00". */
const MODIFIER_RE = /^\s*[-+~=>*]+\s*[A-Za-z]/;

const TAX_RE = /\b(tax(es)?|txtl|hst|gst|vat)\d*\b/i;
const TAXABLE_RE = /\b(non-?)?taxable\b/i;
const SUBTOTAL_RE = /\b(sub[\s\-/]*t(o)?t(a)?l|sbtl|subtl)\b|^net(\s+total)?$/i;
const TOTAL_RE = /\b(total|totl|tota|amount\s+due|amt\s+due|balance\s+due|balance|due)\b/i;
/** Category subtotals some POS systems print between groups of items. */
const CATEGORY_RE = /^(food|foods|beverages?|bev|drinks?|bar|liquor|wine|beer|kitchen|alcohol|non-?alcoholic|items?|merchandise|retail|dessert|desserts|appetizers?|entrees?)\b/i;
/** Payment, header and footer lines. Only checked at the start, so "Steak Tip Skewers" survives. */
const SKIP_START_RE =
  /^(suggested\s+)?(tip|tips|gratuity|change|cash|visa|master\s*card|mastercard|amex|american\s+express|discover|debit|credit|card|tender|payment|paid|auth|approval|approved|server|waiter|table|tbl|guests?|check|chk|order|ticket|tab|thank|reprint|station|date|time)\b/i;
/** Suggested tip lines like "18%: (Tip $20.47 Total $134.17)" or "20% 13.85". */
const PERCENT_LINE_RE = /^\d{1,2}(\.\d+)?\s*%/;
const FEE_RE = /\b(service|serv|charge|fee)\b/i;

const DRINK_RE =
  /\b(beer|ipa|bud|coors|miller|modelo|corona|pacifico|stella|guinness|heineken|michelob|pbr|yuengling|blue\s+moon|white\s+claw|truly|lager|pilsner|pils|stout|porter|ale|draft|draught|pint|can|bottle|seltzer|cider|wine|cab|cabernet|merlot|pinot|chardonnay|sauvignon|riesling|rose|prosecco|champagne|cava|sangria|margarita|marg|mojito|martini|negroni|spritz|mule|paloma|daiquiri|cocktail|old\s+fashioned|manhattan|highball|shot|shots|vodka|gin|rum|tequila|mezcal|whiskey|whisky|bourbon|scotch|rye|soda|pop|coke|diet|sprite|pepsi|ginger\s+ale|tonic|lemonade|iced\s+tea|tea|coffee|latte|espresso|cappuccino|juice|water|sparkling|kombucha|drink|bev|beverage|n\/?a\s+bev)\b/i;

export function guessKind(name: string): ItemKind {
  return DRINK_RE.test(name) ? "drink" : "food";
}

/** Letters OCR commonly reads in place of digits, applied only inside price-like tokens. */
const DIGITISH: Record<string, string> = { O: "0", o: "0", D: "0", l: "1", I: "1", i: "1", s: "5", S: "5", B: "8", Z: "2", z: "2", g: "9" };

/** Fix the most common OCR confusions inside price-like tokens. */
function normalizeLine(raw: string): string {
  let line = raw.replace(/\s+/g, " ").trim();
  // A leading quantity of 1 often reads as "I", "l" or "|".
  line = line.replace(/^[Il|](?=\s+[A-Za-z])/, "1");
  line = line.replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
  // "4s.90" -> "45.90": a letter between digits right before the cents.
  line = line.replace(/(^|[\s$(-])([0-9OolIisSBZzgD]{1,5})([.,])([0-9OolIisSBZzgD]{2})(?![\w.,])/g, (m, pre, a, dot, b) => {
    if ((a + b).replace(/[^0-9]/g, "").length < 2) return m;
    const fix = (t: string) => t.replace(/[OolIisSBZzgD]/g, (c) => DIGITISH[c] ?? c);
    return `${pre}${fix(a)}${dot}${fix(b)}`;
  });
  // "$2295" at the end of a line is $22.95 with the decimal point lost.
  line = line.replace(/\$(\d{1,3})(\d{2})\s*$/, (_m, d, c) => `$${d}.${c}`);
  // A space may follow a decimal point ("12. 50") but never a comma, so "Jun 26, 15" stays a date.
  return line.replace(/(^|[\s$S(-])([0-9OolI]{1,5})(?:\.\s?|,)([0-9OolI]{2})(?![\w.,])/g, (m, pre, a, b) => {
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
    .replace(/\s+\$?\d{1,5}[.,]\d{2}\s*$/, "")
    .replace(/[.\-_=:~]{2,}/g, " ")
    .replace(/^[^A-Za-z0-9(]+/, "")
    .replace(/[^A-Za-z0-9)\]%!]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "(8.99)", "-$17.95" and "$12.50" to signed cents. */
function priceToCents(token: string): number | null {
  const negative = /^\(|-/.test(token.trim());
  const cents = toCents(token.replace(/[()$S\s-]/g, ""));
  return cents === null ? null : negative ? -cents : cents;
}

/** Header, payment and suggested-tip lines. A negative amount on a percent line is a discount, so it stays. */
const isSkipLine = (name: string, cents = 0) =>
  SKIP_START_RE.test(name) ||
  (PERCENT_LINE_RE.test(name) && !FEE_RE.test(name) && cents >= 0) ||
  (/%/.test(name) && /\b(tip|gratuity)/i.test(name));

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
  // A description waiting for its price on the next line ("3 Sockeye Salmon" / "$36.00").
  let pendingName: { name: string; qty: number } | null = null;
  // A price waiting for its description on the next line (retail columns).
  let pendingPrice: { qty: number; cents: number } | null = null;
  // Items since the last group subtotal, to spot lines like "FOOD : $134.00".
  let groupStart = 0;
  let afterSubtotal = false;

  const addItem = (name: string, qty: number, priceCents: number) => {
    out.items.push({ name, qty, priceCents, kind: guessKind(name) });
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = normalizeLine(raw);
    if (line.length < 2) continue;

    if (!afterSubtotal) {
      const sku = SKU_RE.exec(line);
      if (sku) {
        pendingPrice = { qty: parseInt(sku[1], 10) || 1, cents: toCents(sku[2]) ?? 0 };
        pendingName = null;
        continue;
      }
      if (pendingPrice && /^[A-Za-z][A-Za-z0-9 '&/.-]{1,40}$/.test(line)) {
        addItem(cleanName(line), pendingPrice.qty, pendingPrice.cents);
        pendingPrice = null;
        continue;
      }
    }
    pendingPrice = null;

    const bare = BARE_RE.exec(line);
    if (bare && isJunkTail(bare[2])) {
      const cents = priceToCents(bare[1]);
      if (cents === null) continue;
      const sumSoFar = out.items.reduce((a, i) => a + i.priceCents, 0);
      // A lone amount equal to everything so far is an unlabeled subtotal, not this line's price.
      if (pendingName && !afterSubtotal && cents !== 0 && !(out.items.length > 0 && cents === sumSoFar)) {
        addItem(pendingName.name, pendingName.qty, cents);
        pendingName = null;
        continue;
      }
      amounts.push({ cents, itemsBefore: out.items.length });
      continue;
    }

    const m = LINE_RE.exec(line);
    if (!m) {
      // Possibly a description whose price is on the next line.
      const name = cleanName(line.replace(/^\d{1,2}\s+/, ""));
      const qty = /^(\d{1,2})\s+[A-Za-z]/.exec(line);
      const looksLikeItem =
        /[A-Za-z]{3,}/.test(name) && !MODIFIER_RE.test(raw) && !isSkipLine(name) && !TAX_RE.test(name) && !TOTAL_RE.test(name);
      pendingName = !afterSubtotal && looksLikeItem && (qty || out.items.length > 0) ? { name, qty: qty ? parseInt(qty[1], 10) : 1 } : null;
      continue;
    }
    pendingName = null;

    const [, qtyStr, rawName, priceStr, tail] = m;
    if (!isJunkTail(tail)) continue;
    // "1.89 lbs @ $19.50/lbs" is a per-unit rate, not a line total.
    if (/^\s*\//.test(tail)) continue;
    const priceCents = priceToCents(priceStr);
    if (priceCents === null) continue;
    const name = cleanName(rawName);
    amounts.push({ cents: priceCents, itemsBefore: out.items.length });

    if (SUBTOTAL_RE.test(name)) {
      // A second "Sub Total" after tax is subtotal plus tax. Keep the first.
      if (out.subtotalCents === null) out.subtotalCents = priceCents;
      afterSubtotal = true;
      continue;
    }
    if (TAXABLE_RE.test(name)) continue;
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
    if (afterSubtotal) continue;
    if (isSkipLine(name, priceCents)) continue;
    if (!/[A-Za-z]{2,}/.test(name)) continue;
    if (priceCents === 0) continue;

    const prev = out.items[out.items.length - 1];
    if (MODIFIER_RE.test(raw) && prev) {
      prev.priceCents += priceCents;
      continue;
    }

    // A category subtotal ("FOOD : $134.00") equals the items since the last one.
    const groupSum = out.items.slice(groupStart).reduce((a, i) => a + i.priceCents, 0);
    if (!qtyStr && CATEGORY_RE.test(name) && out.items.length - groupStart >= 2 && priceCents === groupSum) {
      groupStart = out.items.length;
      continue;
    }

    // Quantities on a check are small; "1 6 Wings" read as "16 Wings" means six wings, not sixteen orders.
    const qty = qtyStr ? parseInt(qtyStr, 10) : 1;
    if (qty >= 10) addItem(`${qtyStr} ${name}`.replace(/^(\d)(\d)\s/, "$1 $2 ").replace(/^1 /, ""), 1, priceCents);
    else addItem(name, Math.max(1, qty), priceCents);
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
  const confirmed = (i: number) => {
    const [sub, tax, total] = [amounts[i], amounts[i + 1], amounts[i + 2]];
    return Boolean(tax && total && Math.abs(sub.cents + tax.cents - total.cents) <= 1);
  };
  const at = amounts.findIndex(
    (a, i) => a.itemsBefore >= 1 && Math.abs(a.cents - sumOf(a.itemsBefore)) <= 1 && (a.itemsBefore >= 2 || confirmed(i)),
  );
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
