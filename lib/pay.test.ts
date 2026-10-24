import { describe, expect, it } from "vitest";
import { backupLink, cleanHandles, handlesFromFragment, payBlock, payLinks } from "./pay";
import { computeSplit } from "./split";
import type { Diner, LineItem, TipConfig } from "./types";
import { groupMessage, venmoMessage } from "./venmo";

const H = cleanHandles({ name: "Colton", venmo: "@colton-b", cashapp: "$coltonb", paypal: "coltonb", zelle: "555-123-4567", appleCash: true });

describe("cleanHandles", () => {
  it("accepts pasted profile links and prefixes", () => {
    const h = cleanHandles({
      venmo: "https://venmo.com/u/colton-b",
      cashapp: "https://cash.app/$coltonb",
      paypal: "https://www.paypal.me/coltonb/20",
    });
    expect([h.venmo, h.cashapp, h.paypal]).toEqual(["colton-b", "coltonb", "coltonb"]);
    expect(cleanHandles({ venmo: " @colton-b " }).venmo).toBe("colton-b");
  });
});

describe("payLinks", () => {
  it("pre-fills the amount for each app", () => {
    const links = payLinks(H, 4156, "Hen & Heifer split");
    expect(links.map((l) => l.url)).toEqual([
      "https://venmo.com/colton-b?txn=pay&amount=41.56&note=Hen%20%26%20Heifer%20split",
      "https://cash.app/$coltonb/41.56",
      "https://paypal.me/coltonb/41.56",
    ]);
  });

  it("adds Zelle and Apple Cash as text", () => {
    const block = payBlock(H, 4156, "x");
    expect(block[0]).toBe("Pay Colton:");
    expect(block).toContain("Zelle: 555-123-4567 ($41.56)");
    expect(block).toContain("Apple Cash works too: $41.56");
    expect(payBlock(cleanHandles({}), 4156, "x")).toEqual([]);
  });
});

describe("backup link", () => {
  it("round-trips through the URL fragment", () => {
    const url = backupLink("https://split.michaelbreeden.me", H);
    expect(url.startsWith("https://split.michaelbreeden.me/#pay=")).toBe(true);
    expect(handlesFromFragment(new URL(url).hash)).toEqual(H);
    expect(handlesFromFragment("#nope")).toBeNull();
    expect(handlesFromFragment("#pay=%%%")).toBeNull();
  });
});

describe("messages", () => {
  const diners: Diner[] = [
    { id: "a", name: "Colton" },
    { id: "b", name: "Michael" },
  ];
  const item = (id: string, cents: number, shares: Record<string, number>): LineItem => ({
    id, name: id, qty: 1, priceCents: cents, kind: "food", mode: "equal", shares,
  });
  const tip: TipConfig = { basis: "post", mode: "percent", percent: 20, amountCents: 0 };
  const r = computeSplit([item("Steak", 3000, { a: 1 }), item("Tacos", 1400, { b: 1 })], diners, 400, tip);

  it("puts pay links in each person's message", () => {
    const msg = venmoMessage(r.diners[1], tip, "Hen & Heifer", H);
    expect(msg).toContain(`Venmo: https://venmo.com/colton-b?txn=pay&amount=${(r.diners[1].totalCents / 100).toFixed(2)}`);
    expect(msg).toContain("Pay Colton:");
    expect(msg).not.toMatch(/[\u2013\u2014]/);
  });

  it("builds a group message with one link each and skips paid people's links", () => {
    const msg = groupMessage(r, "Hen & Heifer", H, { a: true });
    expect(msg).toContain("Colton: $");
    expect(msg).toContain("(paid)");
    expect(msg.match(/venmo\.com/g)).toHaveLength(1);
    expect(msg).toContain("Also pay Colton with: Cash App $coltonb, PayPal paypal.me/coltonb, Zelle 555-123-4567, Apple Cash");
    expect(msg).not.toMatch(/[\u2013\u2014]/);
  });
});
