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
}

/**
 * Core line shape: optional quantity, a description, then a price with two decimals.
 * Based on `(\d+)?\s*(.+?)\s+\$?(\d+\.\d{2})`, hardened for real OCR output:
 * tolerates "2x" / "2 @" quantities, "S" read in place of "$", comma decimals,
 * and trailing tax flags such as "T", "A" or "*".
 */
export const LINE_RE =
  /^\s*(?:(\d{1,2})\s*[xX@]?\s+)?(.+?)\s+[$S]?\s?(-?\d{1,5}[.,]\d{2})\s*[A-Za-z*]{0,2}\s*$/;

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

/** Fix the most common OCR confusions inside the trailing price token only. */
function normalizeLine(raw: string): string {
  let line = raw.replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
  line = line.replace(/([\s$S])([0-9OolI]{1,5})[.,]\s?([0-9OolI]{2})(\s*[A-Za-z*]{0,2})$/, (_m, pre, a, b, tail) => {
    const fix = (s: string) => s.replace(/[Oo]/g, "0").replace(/[lI]/g, "1");
    return `${pre}${fix(a)}.${fix(b)}${tail}`;
  });
  return line;
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
  const out: ParsedReceipt = { items: [], taxCents: null, subtotalCents: null, totalCents: null };

  for (const raw of text.split(/\r?\n/)) {
    const line = normalizeLine(raw);
    if (line.length < 4) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;

    const [, qtyStr, rawName, priceStr] = m;
    const priceCents = toCents(priceStr);
    if (priceCents === null) continue;
    const name = cleanName(rawName);

    if (SUBTOTAL_RE.test(name)) {
      out.subtotalCents = priceCents;
      continue;
    }
    if (TAX_RE.test(name)) {
      out.taxCents = (out.taxCents ?? 0) + priceCents;
      continue;
    }
    if (TOTAL_RE.test(name)) {
      if (out.totalCents === null) out.totalCents = priceCents;
      continue;
    }
    if (SKIP_RE.test(name)) continue;
    if (!/[A-Za-z]{2,}/.test(name)) continue;
    if (priceCents === 0) continue;

    const qty = qtyStr ? Math.max(1, parseInt(qtyStr, 10)) : 1;
    out.items.push({ name, qty, priceCents, kind: guessKind(name) });
  }

  return out;
}
