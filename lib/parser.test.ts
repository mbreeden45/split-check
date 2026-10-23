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
