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

// Real receipt (Barney's Beanery, Pasadena). A card covers the Subtotal / Tax / Total labels.
const BARNEYS = `Barney's Beanery - Pasadena
99 East Colorado Boulevard RB
Pasadena, CA 91105
Server: ELIZABETH C |
Check #111 Table 11
Ordered: 10/18/26 2:47 PM
1 Modelo Lager (Pint) $7.50
1 Stone Delicious (Pint) $8.50
1 6 Wings $15.00
Fries $ $5.00
3 Route 66 Hazy (Pint) $22.50 |
2 Negroni $36.00
1 P.0.G. Kombucha (Pint) $8.50
eapple Seltzer (Pint) $8.50 f
$111.50 \\
AMERICAN! $2.20
EXPRESS | $113.70
| Suggested Tip:
| 18%: (Tip $20.47 Total $134.17)
| 20%: (Tip $22.74 Total $136.44)
3 23%: (Tip $26.15 Total $139.85)
| Tip percentages are based on the check
_g price after taxes.`;

describe("real receipt: Barney's Beanery", () => {
  const r = parseReceiptText(BARNEYS);

  it("reads every item and nothing past the totals", () => {
    expect(r.items.map((i) => [i.qty, i.name, i.priceCents])).toEqual([
      [1, "Modelo Lager (Pint)", 750],
      [1, "Stone Delicious (Pint)", 850],
      [1, "6 Wings", 1500],
      [1, "Fries", 500],
      [3, "Route 66 Hazy (Pint)", 2250],
      [2, "Negroni", 3600],
      [1, "P.0.G. Kombucha (Pint)", 850],
      [1, "eapple Seltzer (Pint)", 850],
    ]);
  });

  it("finds the unlabeled subtotal, tax and total by their arithmetic", () => {
    expect(r.subtotalCents).toBe(11150);
    expect(r.taxCents).toBe(220);
    expect(r.totalCents).toBe(11370);
  });

  it("keeps the drinks tax-included and the food taxable", () => {
    expect(r.drinksTaxed).toBe(false);
    expect(r.items.filter((i) => i.kind === "food").map((i) => i.name)).toEqual(["6 Wings", "Fries"]);
  });
});

// The same Barney's photo as read by the on-device PaddleOCR reader (no labels hidden this time,
// but its own quirks: "16 Wings" for "1 6 Wings", a stray "b").
const BARNEYS_PADDLE = `19 EST.20
Barney' Beanery a
tColorado Boulevard
Pasadena, CA 91105
Server: ELIZABETH C
Check #111 Table 11
Ordered: 10/18/26 2:47 PM
1 Modelo Lager Pint) $7.50
1 Stone Delicious (Pint)b $8.50
16 Wings $15.00
Fries $ $5.00
3 Route 66 Hazy (Pint) $22.50
2 Negroni $36.00
1 P.0.G. Kombucha (Pint) $8.50
eapple Seltzer (Pint) $8.50
$111.50
AMERICAN $2.20
EXPRESS $113.70
Suggested Tip:
18%: (Tip $20.47 Total $134.17)
20%: (Tip $22.74 Total $136.44)`;

describe("real receipt: Barney's via PaddleOCR", () => {
  const r = parseReceiptText(BARNEYS_PADDLE);
  it("reads every price and reconciles", () => {
    expect(r.items.map((i) => i.priceCents)).toEqual([750, 850, 1500, 500, 2250, 3600, 850, 850]);
    expect(r.subtotalCents).toBe(11150);
    expect(r.taxCents).toBe(220);
    expect(r.totalCents).toBe(11370);
  });
  it("treats a two digit quantity as part of the name", () => {
    expect(r.items[2]).toMatchObject({ qty: 1, name: "6 Wings" });
  });
});

describe("OCR misreads in prices", () => {
  it("reads a leading S as a dollar sign and letters inside prices as digits", () => {
    const r = parseReceiptText("3 Lobster Roll S113.25\nBuffalo Wings $23.25\nLunch 4s.90\nSubtotal $181.40");
    expect(r.items.map((i) => i.priceCents)).toEqual([11325, 2325, 4590]);
    expect(r.subtotalCents).toBe(18140);
  });
});

describe("summary labels wrapped onto two lines", () => {
  it("pairs TAX with the amount on the next line", () => {
    const r = parseReceiptText("Tiramisu $8.00\nPinot Grigio $13.75\nSubtotal $21.75\nTAX\n$2.07\nAmount Due $23.82\n18%: Tip $4.29");
    expect(r.items.map((i) => i.priceCents)).toEqual([800, 1375]);
    expect([r.subtotalCents, r.taxCents, r.totalCents]).toEqual([2175, 207, 2382]);
  });
});
