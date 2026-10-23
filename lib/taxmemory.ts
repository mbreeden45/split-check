"use client";

import { RATE_MAX, RATE_MIN } from "./taxcheck";

const KEY = "split-check:tax-rates";
const KEEP = 5;

interface Entry {
  sig: string;
  percent: number;
}

function read(): Entry[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e) => typeof e?.percent === "number") : [];
  } catch {
    return [];
  }
}

/** Median of the last few checks' tax rates, kept only in this browser. */
export function typicalTaxRatePercent(): number | null {
  const rates = read().map((e) => e.percent).sort((a, b) => a - b);
  if (rates.length === 0) return null;
  const mid = Math.floor(rates.length / 2);
  return rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
}

/** Remember a finished check's rate. `sig` identifies the check so revisits don't count twice. */
export function rememberTaxRate(sig: string, rate: number) {
  if (!(rate >= RATE_MIN && rate <= RATE_MAX)) return;
  try {
    const entries = read().filter((e) => e.sig !== sig);
    entries.push({ sig, percent: Math.round(rate * 10000) / 100 });
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-KEEP)));
  } catch {
    // Storage blocked: the app just falls back to the general range.
  }
}
