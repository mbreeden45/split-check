"use client";

import { useEffect, useReducer, useRef } from "react";
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
  /** Values read off the receipt, used only to flag mismatches. */
  printedSubtotalCents: number | null;
  printedTotalCents: number | null;
  tip: TipConfig;
}

export const initialState: CheckState = {
  step: "scan",
  venue: "",
  items: [],
  diners: [],
  taxCents: 0,
  printedSubtotalCents: null,
  printedTotalCents: null,
  tip: { basis: "post", mode: "percent", percent: 20, amountCents: 0 },
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
    }
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
        printedSubtotalCents: action.subtotalCents,
        printedTotalCents: action.totalCents,
      };
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
