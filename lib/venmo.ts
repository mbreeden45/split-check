import type { DinerBreakdown, SplitResult } from "./split";
import type { TipConfig } from "./types";
import { formatMoney } from "./money";
import { EMPTY_HANDLES, hasAnyHandle, payBlock, payLinks, type PayHandles } from "./pay";

export function tipLabel(tip: TipConfig): string {
  if (tip.mode === "amount") return "Tip";
  return `Tip (${trimNum(tip.percent)}% ${tip.basis === "post" ? "post-tax" : "pre-tax"})`;
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

const title = (venue?: string) => (venue?.trim() ? venue.trim() : "Split Check");

/** Note attached to the payment inside Venmo. */
export const paymentNote = (venue?: string) => (venue?.trim() ? `${venue.trim()} split` : "Split Check");

/**
 * One person's message: their items, tax, tip and total, then links that open each
 * payment app ready to pay the collector. Uses colons and hyphens only, never em dashes.
 */
export function venmoMessage(b: DinerBreakdown, tip: TipConfig, venue?: string, handles: PayHandles = EMPTY_HANDLES): string {
  const out: string[] = [];
  out.push(`${title(venue)}: ${b.diner.name}`);
  out.push("");
  for (const l of b.lines) {
    const portion = l.portion ? ` (${l.portion})` : "";
    out.push(`- ${l.name}${portion}: ${formatMoney(l.cents)}`);
  }
  out.push("");
  out.push(`Items: ${formatMoney(b.subtotalCents)}`);
  out.push(`Tax share: ${formatMoney(b.taxCents)}`);
  if (b.feesCents !== 0) out.push(`Fees & discounts: ${formatMoney(b.feesCents)}`);
  out.push(`${tipLabel(tip)}: ${formatMoney(b.tipCents)}`);
  out.push(`Total: ${formatMoney(b.totalCents)}`);
  const pay = payBlock(handles, b.totalCents, paymentNote(venue));
  if (pay.length) out.push("", ...pay);
  return out.join("\n");
}

/** One message for the group chat: everyone's total with their own pay link. */
export function groupMessage(
  result: SplitResult,
  venue: string | undefined,
  handles: PayHandles,
  paid: Record<string, boolean>,
): string {
  const people = result.diners.filter((b) => b.lines.length > 0);
  const out = [`${title(venue)}: ${formatMoney(result.grandTotalCents)} total`, ""];
  for (const b of people) {
    if (paid[b.diner.id]) {
      out.push(`${b.diner.name}: ${formatMoney(b.totalCents)} (paid)`);
      continue;
    }
    out.push(`${b.diner.name}: ${formatMoney(b.totalCents)}`);
    const [primary] = payLinks(handles, b.totalCents, paymentNote(venue));
    if (primary) out.push(`${primary.app}: ${primary.url}`);
  }
  if (hasAnyHandle(handles)) {
    const others: string[] = [];
    const links = payLinks(handles, 0, "");
    for (const l of links.slice(1)) {
      if (l.app === "Cash App") others.push(`Cash App $${handles.cashapp}`);
      if (l.app === "PayPal") others.push(`PayPal paypal.me/${handles.paypal}`);
    }
    if (handles.zelle) others.push(`Zelle ${handles.zelle}`);
    if (handles.appleCash) others.push("Apple Cash");
    if (others.length) out.push("", `${links.length ? "Also pay" : "Pay"} ${handles.name || "me"} with: ${others.join(", ")}`);
  }
  return out.join("\n");
}
