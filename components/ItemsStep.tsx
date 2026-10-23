"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, type Dispatch } from "react";
import type { Action, CheckState } from "@/lib/store";
import type { ItemKind } from "@/lib/types";
import { Icon, Money, MoneyInput, Row, Section, Segmented, haptic } from "./ui";

export default function ItemsStep({
  state,
  dispatch,
  photoUrl,
}: {
  state: CheckState;
  dispatch: Dispatch<Action>;
  photoUrl: string | null;
}) {
  const [showPhoto, setShowPhoto] = useState(false);
  const [focusLast, setFocusLast] = useState(false);

  const itemsTotal = state.items.reduce((a, i) => a + i.priceCents, 0);
  const foodTotal = state.items.filter((i) => i.kind === "food").reduce((a, i) => a + i.priceCents, 0);
  const mismatch =
    state.printedSubtotalCents !== null && state.printedSubtotalCents !== itemsTotal
      ? state.printedSubtotalCents - itemsTotal
      : null;

  const add = (kind: ItemKind) => {
    haptic();
    dispatch({ type: "addItem", kind });
    setFocusLast(true);
  };

  return (
    <>
      {photoUrl && (
        <div className="-mt-3 mb-4">
          <button type="button" className="link px-4" onClick={() => setShowPhoto((v) => !v)} aria-expanded={showPhoto}>
            {showPhoto ? "Hide Photo" : "Show Photo"}
          </button>
          {showPhoto && (
            <div className="group max-h-[60dvh] overflow-auto">
              <img src={photoUrl} alt="Your receipt photo" className="w-full" />
            </div>
          )}
        </div>
      )}

      <Section>
        <label className="flex items-center gap-3 px-4">
          <span className="shrink-0">Place</span>
          <input
            className="field-bare text-right"
            placeholder="Optional"
            value={state.venue}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => dispatch({ type: "venue", venue: e.target.value })}
          />
        </label>
      </Section>

      <Section
        title="Items"
        footer="Check each line against the receipt. Food gets tax added. Drinks already include tax."
      >
        {state.items.length === 0 && (
          <p className="px-4 py-3 text-label-2">No items found. Add them below.</p>
        )}
        {state.items.map((item, idx) => (
          <div key={item.id} className="px-4 pb-3 pt-1">
            <div className="flex items-center gap-2">
              <input
                aria-label="Quantity"
                className="h-8 w-9 shrink-0 rounded-md bg-fill text-center text-[15px] tabular-nums text-label"
                inputMode="numeric"
                value={item.qty}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                  dispatch({ type: "updateItem", id: item.id, patch: { qty: Number.isFinite(n) ? Math.min(99, n) : 1 } });
                }}
              />
              <input
                aria-label="Item name"
                className="field-bare min-w-0 flex-1"
                placeholder="Item name"
                value={item.name}
                autoFocus={focusLast && idx === state.items.length - 1 && !item.name}
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="next"
                onChange={(e) => dispatch({ type: "updateItem", id: item.id, patch: { name: e.target.value } })}
              />
              <MoneyInput
                label={`Price for ${item.name || "item"}`}
                cents={item.priceCents}
                onChange={(cents) => dispatch({ type: "updateItem", id: item.id, patch: { priceCents: cents } })}
                className="w-28 shrink-0"
              />
            </div>
            <div className="flex items-center gap-3">
              <Segmented
                label="Tax type"
                value={item.kind}
                onChange={(kind) => dispatch({ type: "updateItem", id: item.id, patch: { kind } })}
                options={[
                  { value: "food", label: "Food (Taxable)" },
                  { value: "drink", label: "Drink (Tax Incl.)" },
                ]}
                className="flex-1"
              />
              <button
                type="button"
                className="-mr-2 grid h-11 w-10 shrink-0 place-items-center text-danger active:opacity-40"
                aria-label={`Delete ${item.name || "item"}`}
                onClick={() => {
                  haptic(12);
                  dispatch({ type: "removeItem", id: item.id });
                }}
              >
                <Icon name="trash" />
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="link w-full px-4" onClick={() => add("food")}>
          <Icon name="plus" /> Add Food
        </button>
        <button type="button" className="link w-full px-4" onClick={() => add("drink")}>
          <Icon name="plus" /> Add Drink
        </button>
      </Section>

      <Section
        title="Totals"
        footer={
          mismatch !== null ? (
            <span className="text-warn">
              The receipt subtotal is <Money cents={state.printedSubtotalCents ?? 0} />, so you are{" "}
              <Money cents={Math.abs(mismatch)} /> {mismatch > 0 ? "short. An item may be missing." : "over. Check for duplicates."}
            </span>
          ) : (
            "Tax is only split among people who ordered food."
          )
        }
      >
        <Row label="Food">
          <Money cents={foodTotal} />
        </Row>
        <Row label="Drinks">
          <Money cents={itemsTotal - foodTotal} />
        </Row>
        <label className="flex min-h-11 items-center justify-between gap-3 px-4">
          <span>Tax</span>
          <MoneyInput label="Tax" cents={state.taxCents} onChange={(cents) => dispatch({ type: "tax", cents })} className="w-32 text-accent" />
        </label>
        <Row label="Total Before Tip" strong>
          <Money cents={itemsTotal + state.taxCents} />
        </Row>
      </Section>
    </>
  );
}
