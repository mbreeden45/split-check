"use client";

import { useState, type Dispatch } from "react";
import type { Action, CheckState } from "@/lib/store";
import type { SplitResult } from "@/lib/split";
import { itemWeights } from "@/lib/split";
import { allocate } from "@/lib/money";
import { Icon, Money, Section, Segmented, Stepper, haptic } from "./ui";

export default function SplitStep({
  state,
  dispatch,
  result,
}: {
  state: CheckState;
  dispatch: Dispatch<Action>;
  result: SplitResult;
}) {
  const [name, setName] = useState("");

  const addDiner = (raw: string) => {
    const n = raw.trim();
    if (!n) return;
    haptic();
    dispatch({ type: "addDiner", name: n });
    setName("");
  };

  const nextSeat = () => {
    const taken = new Set(state.diners.map((d) => d.name.toLowerCase()));
    let n = state.diners.length + 1;
    while (taken.has(`seat ${n}`)) n++;
    return `Seat ${n}`;
  };

  const unclaimed = result.unassignedItems.length;

  return (
    <>
      <Section title="People" footer="Tap a name to rename it.">
        {state.diners.map((d) => (
          <div key={d.id} className="flex items-center gap-2 pl-4 pr-2">
            <input
              className="field-bare min-w-0 flex-1"
              value={d.name}
              aria-label="Person name"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              onChange={(e) => dispatch({ type: "renameDiner", id: d.id, name: e.target.value })}
              onBlur={() => !d.name.trim() && dispatch({ type: "renameDiner", id: d.id, name: "Guest" })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <Money cents={result.diners.find((b) => b.diner.id === d.id)?.subtotalCents ?? 0} className="text-label-2" />
            <button
              type="button"
              className="grid h-11 w-10 place-items-center text-danger active:opacity-40"
              aria-label={`Remove ${d.name}`}
              onClick={() => {
                haptic(12);
                dispatch({ type: "removeDiner", id: d.id });
              }}
            >
              <Icon name="trash" />
            </button>
          </div>
        ))}
        <form
          className="flex items-center gap-2 pl-4 pr-2"
          onSubmit={(e) => {
            e.preventDefault();
            addDiner(name);
          }}
        >
          <input
            className="field-bare min-w-0 flex-1"
            placeholder="Add a name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            aria-label="New person name"
          />
          <button type="submit" className="link px-2 font-semibold" disabled={!name.trim()}>
            Add
          </button>
        </form>
        <button type="button" className="link w-full px-4" onClick={() => addDiner(nextSeat())}>
          <Icon name="plus" /> Add {nextSeat()}
        </button>
      </Section>

      {state.diners.length > 0 && (
        <Section
          title={unclaimed > 0 ? `Items · ${unclaimed} unclaimed` : "Items"}
          footer="Tap one name to give someone the whole item. Tap several to split it evenly. Use Shares for uneven splits, like 2 of 3 beers."
        >
          {state.items.map((item) => {
            const weights = itemWeights(item, state.diners);
            const count = weights.filter((w) => w > 0).length;
            const parts = allocate(item.priceCents, weights);
            return (
              <div key={item.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold">
                    {item.qty > 1 && <span className="font-normal text-label-2">{item.qty}× </span>}
                    {item.name || "Untitled item"}
                  </span>
                  <Money cents={item.priceCents} />
                </div>
                <p className={`text-[13px] ${count === 0 ? "text-danger" : "text-label-2"}`}>
                  {item.kind === "food" ? "Food" : "Drink"}
                  {" · "}
                  {count === 0 ? "Not claimed" : count === 1 ? "1 person" : `Split ${count} ways`}
                </p>

                {item.mode === "equal" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {state.diners.map((d, i) => (
                      <button
                        key={d.id}
                        type="button"
                        className="chip"
                        aria-pressed={weights[i] > 0}
                        onClick={() => {
                          haptic();
                          dispatch({ type: "toggleShare", itemId: item.id, dinerId: d.id });
                        }}
                      >
                        {d.name}
                        {weights[i] > 0 && count > 1 && <Money cents={parts[i]} className="text-[13px] opacity-80" />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1">
                    {state.diners.map((d, i) => (
                      <div key={d.id} className="flex min-h-11 items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{d.name}</span>
                        <span className="flex items-center gap-3">
                          {weights[i] > 0 && <Money cents={parts[i]} className="text-[15px] text-label-2" />}
                          <Stepper
                            label={`${d.name} shares`}
                            value={item.shares[d.id] ?? 0}
                            onChange={(weight) => dispatch({ type: "setShare", itemId: item.id, dinerId: d.id, weight })}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex items-center gap-4">
                  <Segmented
                    label="Split type"
                    value={item.mode}
                    onChange={(mode) => dispatch({ type: "setMode", itemId: item.id, mode })}
                    options={[
                      { value: "equal", label: "Even" },
                      { value: "custom", label: "Shares" },
                    ]}
                    className="w-40"
                  />
                  <button type="button" className="link text-[15px]" onClick={() => dispatch({ type: "assignAll", itemId: item.id })}>
                    Everyone
                  </button>
                  {count > 0 && (
                    <button type="button" className="link text-[15px]" onClick={() => dispatch({ type: "clearShares", itemId: item.id })}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </Section>
      )}
    </>
  );
}
