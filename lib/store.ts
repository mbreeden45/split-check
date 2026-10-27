"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { EMPTY_HANDLES, cleanHandles, handlesFromFragment, type PayHandles } from "./pay";
import type { Diner, ItemKind, LineItem, SplitMode, TipConfig } from "./types";
import type { ParsedItem } from "./parser";

export type Step = "scan" | "items" | "split" | "totals";
export const STEPS: { id: Step; label: string }[] = [
  { id: "scan", label: "Scan" },
  { id: "items", label: "Items" },
  { id: "split", label: "Split" },
  { id: "totals", label: "Tip & Pay" },
];

export interface CheckState {
  step: Step;
  venue: string;
  items: LineItem[];
  diners: Diner[];
  taxCents: number;
  /** Fees minus discounts (delivery fee, service charge, promotions). Can be negative. */
  feesCents: number;
  /** A tip already charged on the receipt (delivery apps), so the printed total includes it. */
  receiptTipCents: number | null;
  /** The receipt's tax line includes fees, so the tax rate check doesn't apply. */
  taxIncludesFees: boolean;
  /** The person tapped Ignore on the receipt-total check. */
  totalHintDismissed: boolean;
  /** Values read off the receipt, used only to flag mismatches. */
  printedSubtotalCents: number | null;
  printedTotalCents: number | null;
  /** Tax rate printed on the receipt, e.g. 10.5. */
  printedTaxRatePercent: number | null;
  /** The person tapped Ignore on the tax hint for this check. */
  taxHintDismissed: boolean;
  /** One-line explanation of an automatic decision made while reading the receipt. */
  notice: string | null;
  tip: TipConfig;
  /** Diner ids the collector has marked as paid. */
  paid: Record<string, boolean>;
}

export const initialState: CheckState = {
  step: "scan",
  venue: "",
  items: [],
  diners: [],
  taxCents: 0,
  feesCents: 0,
  receiptTipCents: null,
  taxIncludesFees: false,
  totalHintDismissed: false,
  printedSubtotalCents: null,
  printedTotalCents: null,
  printedTaxRatePercent: null,
  taxHintDismissed: false,
  notice: null,
  tip: { basis: "post", mode: "percent", percent: 20, amountCents: 0 },
  paid: {},
};

export type Action =
  | { type: "hydrate"; state: CheckState }
  | { type: "step"; step: Step }
  | { type: "venue"; venue: string }
  | {
      type: "loadParsed";
      items: ParsedItem[];
      taxCents: number | null;
      subtotalCents: number | null;
      totalCents: number | null;
      taxRatePercent: number | null;
      drinksTaxed: boolean;
      adjustmentsCents: number;
      tipCents: number | null;
      taxIncludesFees: boolean;
    }
  | { type: "fees"; cents: number }
  | { type: "dismissTotalHint" }
  | { type: "applyTaxSuggestion"; includedIds: string[] }
  | { type: "dismissTaxHint" }
  | { type: "togglePaid"; dinerId: string }
  | { type: "addItem"; kind?: ItemKind }
  | { type: "updateItem"; id: string; patch: Partial<Pick<LineItem, "name" | "qty" | "priceCents" | "kind">> }
  | { type: "removeItem"; id: string }
  | { type: "addDiner"; name: string }
  | { type: "renameDiner"; id: string; name: string }
  | { type: "removeDiner"; id: string }
  | { type: "toggleShare"; itemId: string; dinerId: string }
  | { type: "setShare"; itemId: string; dinerId: string; weight: number }
  | { type: "setMode"; itemId: string; mode: SplitMode }
  | { type: "assignAll"; itemId: string }
  | { type: "clearShares"; itemId: string }
  | { type: "tax"; cents: number }
  | { type: "tip"; patch: Partial<TipConfig> }
  | { type: "reset" };

export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function newItem(p: Partial<LineItem> = {}): LineItem {
  return { id: uid(), name: "", qty: 1, priceCents: 0, kind: "food", mode: "equal", shares: {}, ...p };
}

function mapItem(state: CheckState, id: string, fn: (i: LineItem) => LineItem): CheckState {
  return { ...state, items: state.items.map((i) => (i.id === id ? fn(i) : i)) };
}

export function reducer(state: CheckState, action: Action): CheckState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "step":
      return { ...state, step: action.step };
    case "venue":
      return { ...state, venue: action.venue };
    case "loadParsed":
      return {
        ...state,
        step: "items",
        items: action.items.map((p) => newItem({ ...p })),
        taxCents: action.taxCents ?? 0,
        feesCents: action.adjustmentsCents,
        receiptTipCents: action.tipCents,
        taxIncludesFees: action.taxIncludesFees,
        totalHintDismissed: false,
        // A tip already charged on the receipt (delivery apps) becomes the tip, as a dollar amount.
        tip:
          action.tipCents !== null && action.tipCents > 0
            ? { ...state.tip, mode: "amount", amountCents: action.tipCents }
            : state.tip,
        printedSubtotalCents: action.subtotalCents,
        printedTotalCents: action.totalCents,
        printedTaxRatePercent: action.taxRatePercent,
        taxHintDismissed: false,
        notice: action.drinksTaxed
          ? "The tax on this receipt covers drinks too, so every item is marked Taxable."
          : null,
      };
    case "applyTaxSuggestion": {
      const included = new Set(action.includedIds);
      return {
        ...state,
        items: state.items.map((i) => ({ ...i, kind: included.has(i.id) ? "drink" : "food" })),
      };
    }
    case "dismissTaxHint":
      return { ...state, taxHintDismissed: true };
    case "togglePaid":
      return { ...state, paid: { ...state.paid, [action.dinerId]: !state.paid[action.dinerId] } };
    case "addItem":
      return { ...state, items: [...state.items, newItem({ kind: action.kind ?? "food" })] };
    case "updateItem":
      return mapItem(state, action.id, (i) => ({ ...i, ...action.patch }));
    case "removeItem":
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    case "addDiner": {
      const name = action.name.trim();
      if (!name) return state;
      return { ...state, diners: [...state.diners, { id: uid(), name }] };
    }
    case "renameDiner":
      return {
        ...state,
        diners: state.diners.map((d) => (d.id === action.id ? { ...d, name: action.name } : d)),
      };
    case "removeDiner":
      return {
        ...state,
        paid: Object.fromEntries(Object.entries(state.paid).filter(([id]) => id !== action.id)),
        diners: state.diners.filter((d) => d.id !== action.id),
        items: state.items.map((i) => {
          if (!(action.id in i.shares)) return i;
          const shares = { ...i.shares };
          delete shares[action.id];
          return { ...i, shares };
        }),
      };
    case "toggleShare":
      return mapItem(state, action.itemId, (i) => {
        const on = (i.shares[action.dinerId] ?? 0) > 0;
        return { ...i, shares: { ...i.shares, [action.dinerId]: on ? 0 : 1 } };
      });
    case "setShare":
      return mapItem(state, action.itemId, (i) => ({
        ...i,
        shares: { ...i.shares, [action.dinerId]: Math.max(0, Math.min(99, Math.round(action.weight))) },
      }));
    case "setMode":
      return mapItem(state, action.itemId, (i) => {
        // Normalize so every selected diner starts at one share in either mode.
        const shares: Record<string, number> = {};
        for (const [k, v] of Object.entries(i.shares)) if (v > 0) shares[k] = 1;
        return { ...i, mode: action.mode, shares };
      });
    case "assignAll":
      return mapItem(state, action.itemId, (i) => ({
        ...i,
        shares: Object.fromEntries(state.diners.map((d) => [d.id, 1])),
      }));
    case "clearShares":
      return mapItem(state, action.itemId, (i) => ({ ...i, shares: {} }));
    case "tax":
      return { ...state, taxCents: Math.max(0, action.cents) };
    case "fees":
      return { ...state, feesCents: action.cents };
    case "dismissTotalHint":
      return { ...state, totalHintDismissed: true };
    case "tip":
      return { ...state, tip: { ...state.tip, ...action.patch } };
    case "reset":
      return initialState;
  }
}

const STORAGE_KEY = "split-check:v1";

/** Check state lives only in this browser's localStorage. Photos are never persisted. */
export function useCheck() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<CheckState>;
        if (saved && Array.isArray(saved.items) && Array.isArray(saved.diners)) {
          dispatch({
            type: "hydrate",
            state: { ...initialState, ...saved, tip: { ...initialState.tip, ...saved.tip } },
          });
        }
      }
    } catch {
      // Private mode or blocked storage: start fresh.
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota or privacy errors.
    }
  }, [state]);

  return [state, dispatch] as const;
}

const HANDLES_KEY = "split-check:pay-handles";

/**
 * The collector's payment handles. They live only in this browser's localStorage,
 * never on a server, and survive New Check. Opening a backup link restores them.
 */
export function usePayHandles() {
  const [handles, setHandlesState] = useState<PayHandles>(EMPTY_HANDLES);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let saved: PayHandles = EMPTY_HANDLES;
    try {
      const raw = window.localStorage.getItem(HANDLES_KEY);
      if (raw) saved = cleanHandles(JSON.parse(raw));
    } catch {
      // Blocked or corrupt storage: start empty.
    }
    const fromLink = handlesFromFragment(window.location.hash);
    if (fromLink) {
      saved = fromLink;
      setRestored(true);
      try {
        window.localStorage.setItem(HANDLES_KEY, JSON.stringify(fromLink));
      } catch {
        // Still usable for this visit.
      }
      // Drop the fragment so the handles don't linger in the address bar or history.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setHandlesState(saved);
  }, []);

  const setHandles = useCallback((h: Partial<PayHandles>) => {
    const clean = cleanHandles(h);
    setHandlesState(clean);
    try {
      window.localStorage.setItem(HANDLES_KEY, JSON.stringify(clean));
    } catch {
      // Ignore quota or privacy errors.
    }
  }, []);

  return { handles, setHandles, restored, clearRestored: () => setRestored(false) };
}
