import { describe, expect, it } from "vitest";
import { analyzeTax } from "./taxcheck";
import type { ItemKind, LineItem } from "./types";

let n = 0;
function item(name: string, dollars: number, kind: ItemKind = "food"): LineItem {
  return { id: `i${n++}`, name, qty: 1, priceCents: Math.round(dollars * 100), kind, mode: "equal", shares: {} };
}

describe("analyzeTax", () => {
  it("is quiet when the tax rate is normal", () => {
    const items = [item("Burger", 15), item("Fries", 6), item("IPA", 8, "drink")];
    const r = analyzeTax(items, 189, null); // 9% of $21
    expect(r.status).toBe("ok");
    expect(r.rate).toBeCloseTo(0.09, 3);
    expect(r.message).toBeNull();
  });

  it("finds the exact tax-included items from a printed rate, even with odd names", () => {
    // Bar: $70 of food taxed at 9.5% ($6.65), four $9 beers already include tax.
    const beers = [item("Pliny the Elder", 9), item("Pliny the Elder", 9), item("Heady Topper", 9), item("Heady Topper", 9)];
    const items = [item("Nachos", 16), item("Wings", 24), item("Burger", 30), ...beers.map((b) => ({ ...b, kind: "food" as const }))];
    const r = analyzeTax(items, 665, 9.5);
    expect(r.status).toBe("low");
    expect(r.suggestion?.direction).toBe("included");
    expect(new Set(r.suggestion?.includedIds)).toEqual(new Set(items.slice(3).map((i) => i.id)));
    expect(r.message).toContain("$36.00");
    expect(r.message).toContain("Pliny the Elder ×2");
  });

  it("uses drink names when no rate is printed", () => {
    const items = [item("Nachos", 16), item("Wings", 24), item("Burger", 30), item("Bud Light", 9), item("Coors", 9), item("Margarita", 18)];
    const r = analyzeTax(items, 525, null); // 5.0% of all $106, 7.5% of the $70 of food
    expect(r.status).toBe("low");
    expect(r.suggestion?.changedIds).toEqual(items.slice(3).map((i) => i.id));
  });

  it("compares against the usual local rate when nothing is printed", () => {
    // 7.0% overall looks normal in general, but not for someone who usually pays 9.5%.
    const items = [item("Nachos", 16), item("Wings", 24), item("Burger", 30), item("Bud Light", 6), item("Coors", 6), item("Margarita", 12)];
    expect(analyzeTax(items, 665, null).status).toBe("ok");
    const r = analyzeTax(items, 665, null, 9.5);
    expect(r.status).toBe("low");
    expect(r.message).toContain("your usual 9.5%");
    expect(r.suggestion?.changedIds).toEqual(items.slice(3).map((i) => i.id));
  });

  it("matches odd drink names against the usual rate too", () => {
    const items = [item("Nachos", 16), item("Wings", 24), item("Burger", 30), item("Pliny", 9), item("Pliny", 9), item("Heady", 9), item("Heady", 9)];
    const r = analyzeTax(items, 665, null, 9.5);
    expect(r.status).toBe("low");
    expect(r.suggestion?.changedIds).toEqual(items.slice(3).map((i) => i.id));
    expect(r.message).toContain("$36.00");
  });

  it("hints without a button when it can't tell which items", () => {
    const items = [item("Nachos", 16), item("Wings", 24), item("Burger", 30), item("Pliny", 9), item("Heady", 9)];
    const r = analyzeTax(items, 300, null); // 3.4% overall, no drink names
    expect(r.status).toBe("low");
    expect(r.suggestion).toBeNull();
    expect(r.message).toContain("usually drinks");
  });

  it("spots drinks that were taxed too", () => {
    const items = [item("Burger", 11.09), item("Fries", 16.99), item("Cider", 10, "drink"), item("Cider", 10, "drink")];
    const r = analyzeTax(items, 506, null); // 10.25% of everything, 18% of food only
    expect(r.status).toBe("high");
    expect(r.suggestion?.direction).toBe("taxable");
    expect(r.message).toContain("Cider ×2 were probably taxed too");
  });

  it("treats a slightly inconsistent printed rate as fine", () => {
    // Hen & Heifer prints 10.5% but charged $7.57 on $73.83.
    const items = [item("Burger", 11.09), item("Chickenator", 15.75), item("Fries", 16.99), item("Cider", 10), item("Cider", 10), item("Cider", 10)];
    expect(analyzeTax(items, 757, 10.5).status).toBe("ok");
  });

  it("stays out of the way with no tax", () => {
    expect(analyzeTax([item("Burger", 10)], 0, null).status).toBe("none");
  });
});
