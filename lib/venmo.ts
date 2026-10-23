import type { DinerBreakdown } from "./split";
import type { TipConfig } from "./types";
import { formatMoney } from "./money";

export function tipLabel(tip: TipConfig): string {
  if (tip.mode === "amount") return "Tip";
  return `Tip (${trimNum(tip.percent)}% ${tip.basis === "post" ? "post-tax" : "pre-tax"})`;
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** Plain text message for Venmo or a group chat. Uses colons and hyphens only, never em dashes. */
export function venmoMessage(b: DinerBreakdown, tip: TipConfig, venue?: string): string {
  const out: string[] = [];
  out.push(`${venue?.trim() ? venue.trim() : "Split Check"}: ${b.diner.name}`);
  out.push("");
  for (const l of b.lines) {
    const portion = l.portion ? ` (${l.portion})` : "";
    out.push(`- ${l.name}${portion}: ${formatMoney(l.cents)}`);
  }
  out.push("");
  out.push(`Items: ${formatMoney(b.subtotalCents)}`);
  out.push(`Tax share: ${formatMoney(b.taxCents)}`);
  out.push(`${tipLabel(tip)}: ${formatMoney(b.tipCents)}`);
  out.push(`Total: ${formatMoney(b.totalCents)}`);
  return out.join("\n");
}
