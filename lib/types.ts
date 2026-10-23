export type ItemKind = "food" | "drink";

/** How an item is divided. `shares` maps diner id to a non-negative weight. */
export type SplitMode = "equal" | "custom";

export interface LineItem {
  id: string;
  name: string;
  /** Quantity printed on the receipt. Informational; `priceCents` is the line total. */
  qty: number;
  /** Line total in cents. */
  priceCents: number;
  kind: ItemKind;
  mode: SplitMode;
  shares: Record<string, number>;
}

export interface Diner {
  id: string;
  name: string;
}

export type TipBasis = "post" | "pre";
export type TipMode = "percent" | "amount";

export interface TipConfig {
  basis: TipBasis;
  mode: TipMode;
  percent: number;
  amountCents: number;
}
