import { describe, expect, it } from "vitest";
import { allocate, toCents, formatMoney } from "./money";
import { computeSplit, computeTipCents } from "./split";
import type { Diner, LineItem, TipConfig } from "./types";
import { venmoMessage } from "./venmo";

const diners: Diner[] = [
  { id: "a", name: "Colton" },
  { id: "b", name: "Michael" },
  { id: "c", name: "Seat 3" },
];

function item(p: Partial<LineItem> & Pick<LineItem, "id" | "priceCents" | "kind">): LineItem {
  return { name: p.id, qty: 1, mode: "equal", shares: {}, ...p };
}

const noTip: TipConfig = { basis: "post", mode: "percent", percent: 0, amountCents: 0 };

describe("allocate", () => {
  it("always sums to the total", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
    expect(allocate(999, [3, 0, 1]).reduce((a, b) => a + b)).toBe(999);
    expect(allocate(500, [0, 0])).toEqual([0, 0]);
  });
});

describe("money", () => {
  it("parses and formats", () => {
    expect(toCents("$12.50")).toBe(1250);
    expect(toCents("12,50")).toBe(1250);
    expect(toCents("1,234.56")).toBe(123456);
    expect(toCents("abc")).toBeNull();
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(-5)).toBe("-$0.05");
  });
});

describe("computeSplit", () => {
  it("charges food tax only to food eaters, proportional to food subtotal", () => {
    const items = [
      item({ id: "burger", priceCents: 1500, kind: "food", shares: { a: 1 } }),
      item({ id: "wings", priceCents: 1000, kind: "food", shares: { b: 1 } }),
      item({ id: "ipa", priceCents: 800, kind: "drink", shares: { c: 1 } }),
    ];
    const r = computeSplit(items, diners, 200, noTip);
    expect(r.diners.map((d) => d.taxCents)).toEqual([120, 80, 0]);
    expect(r.diners[2].totalCents).toBe(800);
    expect(r.unassignedCents).toBe(0);
  });

  it("computes post-tax and pre-tax tips and splits by item subtotal", () => {
    expect(computeTipCents({ ...noTip, percent: 20 }, 10000, 800)).toBe(2160);
    expect(computeTipCents({ ...noTip, percent: 20, basis: "pre" }, 10000, 800)).toBe(2000);
    expect(computeTipCents({ ...noTip, mode: "amount", amountCents: 1234 }, 10000, 800)).toBe(1234);

    const items = [
      item({ id: "steak", priceCents: 3000, kind: "food", shares: { a: 1 } }),
      item({ id: "wine", priceCents: 1000, kind: "drink", shares: { b: 1 } }),
    ];
    const r = computeSplit(items, diners.slice(0, 2), 300, { ...noTip, percent: 20 });
    expect(r.tipCents).toBe(860);
    expect(r.diners.map((d) => d.tipCents)).toEqual([645, 215]);
    const sum = r.diners.reduce((a, d) => a + d.totalCents, 0);
    expect(sum).toBe(r.grandTotalCents);
  });

  it("supports equal and custom share splits", () => {
    const items = [
      item({ id: "nachos", priceCents: 1000, kind: "food", shares: { a: 1, b: 1, c: 1 } }),
      item({ id: "pitcher", priceCents: 2000, kind: "drink", mode: "custom", shares: { a: 3, b: 1 } }),
    ];
    const r = computeSplit(items, diners, 0, noTip);
    expect(r.diners.map((d) => d.subtotalCents)).toEqual([334 + 1500, 333 + 500, 333]);
    expect(r.diners[0].lines[1].portion).toBe("3/4");
    expect(r.diners[2].lines[0].portion).toBe("1/3");
  });

  it("tracks unassigned items with their tax and tip", () => {
    const items = [
      item({ id: "fries", priceCents: 500, kind: "food", shares: { a: 1 } }),
      item({ id: "salad", priceCents: 500, kind: "food" }),
    ];
    const r = computeSplit(items, diners, 100, { ...noTip, mode: "amount", amountCents: 200 });
    expect(r.unassignedItems).toHaveLength(1);
    expect(r.unassignedCents).toBe(500 + 50 + 100);
    expect(r.diners[0].totalCents + r.unassignedCents).toBe(r.grandTotalCents);
  });

  it("falls back to all items when tax exists but no food does", () => {
    const items = [item({ id: "beer", priceCents: 600, kind: "drink", shares: { a: 1 } })];
    const r = computeSplit(items, diners, 50, noTip);
    expect(r.taxFallback).toBe(true);
    expect(r.diners[0].taxCents).toBe(50);
  });
});

describe("venmoMessage", () => {
  it("never contains em or en dashes", () => {
    const items = [item({ id: "Fish Tacos", priceCents: 1400, kind: "food", shares: { a: 1, b: 1 } })];
    const r = computeSplit(items, diners, 100, { ...noTip, percent: 20 });
    const msg = venmoMessage(r.diners[0], { ...noTip, percent: 20 });
    expect(msg).not.toMatch(/[\u2013\u2014]/);
    expect(msg).toContain("Fish Tacos (1/2): $7.00");
    expect(msg).toContain("Total:");
  });
});
