import { describe, expect, it } from "vitest";
import { parseReceiptText, guessKind } from "./parser";

const SAMPLE = `THE RUSTY SPOON
123 Main St
Server: Dana   Table 12
2 Fish Tacos        18.00
Bud Light            6.50
1 Cheeseburger     $14.25 T
House Margarita    11,00
Side Fries  ......   4.5O
SUBTOTAL            54.25
Sales Tax            2.31
TOTAL               56.56
VISA ****1234       56.56
Suggested Tip 20%   11.31`;

describe("parseReceiptText", () => {
  const r = parseReceiptText(SAMPLE);

  it("extracts line items with quantities", () => {
    expect(r.items.map((i) => [i.qty, i.name, i.priceCents])).toEqual([
      [2, "Fish Tacos", 1800],
      [1, "Bud Light", 650],
      [1, "Cheeseburger", 1425],
      [1, "House Margarita", 1100],
      [1, "Side Fries", 450],
    ]);
  });

  it("captures summary lines instead of treating them as items", () => {
    expect(r.subtotalCents).toBe(5425);
    expect(r.taxCents).toBe(231);
    expect(r.totalCents).toBe(5656);
  });

  it("guesses drinks vs food", () => {
    expect(guessKind("Bud Light Draft")).toBe("drink");
    expect(guessKind("House Margarita")).toBe("drink");
    expect(guessKind("Cheeseburger")).toBe("food");
  });
});

// Real receipt (Hen & Heifer, Pomona). OCR output after preprocessing.
const HEN_HEIFER = `HEN & HEIFER
296 W 2nd St
Pomona CA 91766
R. No: POS 134764)
Date: 10-22-2026 6:25 P
Transaction by: Dario
Table: Dining In 1
Qty Description Amt (8)
1 The Standard Burger 9.75
-Carm
-Medium Rare
-American Cheese 1.34
-First Time
-No Upgrade
1 Chickenator 15.75
-No Upgrade
1 Cheese Steak Fries 16.99
-None
1 Golden state cider 10.00
1 Golden state cider 10.00
1 Golden state cider 10.00
Subtotal (6) 73.83
Tax Rate 10.5% 7.57
Total 81.40
Visa 81.40
Change 0.00
Tax Summary Amount Tax
Tax Rate 10.5% 73.83 7.57
Discount Summary Amount
Total Discount 0.00`;

// The same receipt read without cropping: wood grain leaves junk after prices.
const HEN_HEIFER_NOISY = `Qty Description Amt ($) ye
1 The Standard Burger 9.75 gy Ca bE
-American Cheese 1.34 ee
1 Chickenator 15.75 : ALAR
1 Cheese Steak Fries 16.99 AA 7
-None 1% :
1 Golden state cider 10.00 tli =
1 Golden state cider 10.00 a RF
1 Golden state cider 10.00 Zz ©
Subtotal (6) 73.83 4 >
Tax Rate 10.5% 7.57
Total 81.40
Change 0.00 4`;

describe("real receipt: Hen & Heifer", () => {
  const expected = [
    ["The Standard Burger", 1109],
    ["Chickenator", 1575],
    ["Cheese Steak Fries", 1699],
    ["Golden state cider", 1000],
    ["Golden state cider", 1000],
    ["Golden state cider", 1000],
  ];

  for (const [label, text] of [["clean", HEN_HEIFER], ["noisy", HEN_HEIFER_NOISY]] as const) {
    it(`reads every item and folds add-ons into their item (${label})`, () => {
      const r = parseReceiptText(text);
      expect(r.items.map((i) => [i.name, i.priceCents])).toEqual(expected);
      expect(r.items.reduce((a, i) => a + i.priceCents, 0)).toBe(r.subtotalCents);
      expect(r.taxCents).toBe(757);
      expect(r.totalCents).toBe(8140);
    });
  }

  it("notices the tax covers the ciders too and marks everything taxable", () => {
    const r = parseReceiptText(HEN_HEIFER);
    expect(r.taxRatePercent).toBe(10.5);
    expect(r.drinksTaxed).toBe(true);
    expect(r.items.every((i) => i.kind === "food")).toBe(true);
  });
});
