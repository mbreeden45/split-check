"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, type Dispatch } from "react";
import type { Action, CheckState } from "@/lib/store";
import type { ItemKind } from "@/lib/types";
import { Icon, Money, MoneyInput, SectionTitle, Segmented, haptic } from "./ui";

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
  const [focusId, setFocusId] = useState<string | null>(null);

  const itemsTotal = state.items.reduce((a, i) => a + i.priceCents, 0);
  const foodTotal = state.items.filter((i) => i.kind === "food").reduce((a, i) => a + i.priceCents, 0);
  const mismatch =
    state.printedSubtotalCents !== null && state.printedSubtotalCents !== itemsTotal
      ? state.printedSubtotalCents - itemsTotal
      : null;

  const add = (kind: ItemKind) => {
    haptic();
    dispatch({ type: "addItem", kind });
    setFocusId("__last");
  };

  return (
    <section>
      <SectionTitle kicker="Step 02" title="Check the items">
        {photoUrl && (
          <button type="button" className="btn min-h-11 px-3 text-sm" onClick={() => setShowPhoto((v) => !v)} aria-expanded={showPhoto}>
            <Icon name="image" className="h-4 w-4" />
            {showPhoto ? "Hide" : "Photo"}
          </button>
        )}
      </SectionTitle>

      {showPhoto && photoUrl && (
        <div className="check mb-4 max-h-[60dvh] overflow-auto">
          <img src={photoUrl} alt="Your receipt photo" className="w-full" />
        </div>
      )}

      <label className="mb-4 block">
        <span className="label">Venue (optional)</span>
        <input
          className="field mt-1"
          placeholder="e.g. The Rusty Spoon"
          value={state.venue}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => dispatch({ type: "venue", venue: e.target.value })}
        />
      </label>

      <p className="mb-3 text-[0.9375rem] text-ink-soft">
        Tap any line to fix it. Mark each one <strong className="text-ink">Food</strong> (tax gets added) or{" "}
        <strong className="text-ink">Drink</strong> (price already includes tax).
      </p>

      <div className="check overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] border-b-[1.5px] border-ink bg-bone px-3 py-1.5">
          <span className="label">Description</span>
          <span className="label">Amount</span>
        </div>

        {state.items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="font-bold">No items yet.</p>
            <p className="mt-1 text-sm text-ink-soft">OCR found nothing it trusted. Add lines below.</p>
          </div>
        ) : (
          <ul className="ruled">
            {state.items.map((item, idx) => {
              const autoFocus = focusId === item.id || (focusId === "__last" && idx === state.items.length - 1);
              return (
                <li key={item.id} className="space-y-2 px-3 py-3">
                  <div className="grid grid-cols-[3.25rem_1fr_7rem] gap-2">
                    <input
                      aria-label="Quantity"
                      className="field px-1 text-center font-mono tabular-nums"
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
                      className="field font-semibold"
                      placeholder="Item name"
                      value={item.name}
                      autoFocus={autoFocus && !item.name}
                      autoComplete="off"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      onChange={(e) => dispatch({ type: "updateItem", id: item.id, patch: { name: e.target.value } })}
                    />
                    <MoneyInput
                      label={`Price for ${item.name || "item"}`}
                      cents={item.priceCents}
                      onChange={(cents) => dispatch({ type: "updateItem", id: item.id, patch: { priceCents: cents } })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Segmented
                      label="Tax type"
                      value={item.kind}
                      onChange={(kind) => dispatch({ type: "updateItem", id: item.id, patch: { kind } })}
                      options={[
                        { value: "food", label: <KindLabel title="Food" sub="Taxable" /> },
                        { value: "drink", label: <KindLabel title="Drink" sub="Tax Included" /> },
                      ]}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-ink-soft active:bg-stamp-wash active:text-stamp"
                      aria-label={`Delete ${item.name || "item"}`}
                      onClick={() => {
                        haptic(12);
                        dispatch({ type: "removeItem", id: item.id });
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-2 border-t-[1.5px] border-ink bg-bone/60 p-3">
          <button type="button" className="btn text-sm" onClick={() => add("food")}>
            <Icon name="plus" className="h-4 w-4" /> Food
          </button>
          <button type="button" className="btn text-sm" onClick={() => add("drink")}>
            <Icon name="plus" className="h-4 w-4" /> Drink
          </button>
        </div>
      </div>

      <div className="check perf-bottom mt-5 px-4 pb-6 pt-3">
        <dl className="space-y-2 font-mono text-[0.9375rem]">
          <div className="flex justify-between">
            <dt>Items subtotal</dt>
            <dd><Money cents={itemsTotal} /></dd>
          </div>
          <div className="flex justify-between text-ink-soft">
            <dt className="pl-3">Food (taxable)</dt>
            <dd><Money cents={foodTotal} /></dd>
          </div>
          <div className="flex justify-between text-ink-soft">
            <dt className="pl-3">Drinks (tax incl.)</dt>
            <dd><Money cents={itemsTotal - foodTotal} /></dd>
          </div>
        </dl>

        {mismatch !== null && (
          <p className="mt-3 rounded-sm border-[1.5px] border-mustard bg-mustard/15 px-3 py-2 text-sm font-medium">
            Receipt subtotal says <Money cents={state.printedSubtotalCents ?? 0} />. You are{" "}
            <Money cents={Math.abs(mismatch)} /> {mismatch > 0 ? "short, an item may be missing" : "over, check for duplicates"}.
          </p>
        )}

        <div className="rule-dash my-3" />

        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block font-bold">Tax on food</span>
            <span className="text-xs text-ink-soft">From the receipt. Split only among food eaters.</span>
          </span>
          <MoneyInput label="Tax on food" cents={state.taxCents} onChange={(cents) => dispatch({ type: "tax", cents })} className="w-32 shrink-0" />
        </label>

        <div className="rule-dash my-3" />

        <div className="flex items-baseline justify-between">
          <span className="font-black uppercase tracking-tight">Before tip</span>
          <Money cents={itemsTotal + state.taxCents} className="text-xl font-semibold" />
        </div>
        {state.printedTotalCents !== null && state.printedTotalCents !== itemsTotal + state.taxCents && (
          <p className="mt-1 text-right font-mono text-xs text-ink-soft">
            Receipt total read as <Money cents={state.printedTotalCents} />
          </p>
        )}
      </div>
    </section>
  );
}

function KindLabel({ title, sub }: { title: string; sub: string }) {
  return (
    <span className="flex flex-col items-center py-1 leading-tight">
      <span>{title}</span>
      <span className="text-[0.6875rem] font-medium opacity-75">({sub})</span>
    </span>
  );
}
