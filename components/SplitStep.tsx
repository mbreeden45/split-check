"use client";

import { useState, type Dispatch } from "react";
import type { Action, CheckState } from "@/lib/store";
import type { SplitResult } from "@/lib/split";
import { itemWeights } from "@/lib/split";
import { allocate } from "@/lib/money";
import { Icon, Money, SectionTitle, Segmented, Stepper, haptic } from "./ui";

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
  const [editing, setEditing] = useState<string | null>(null);

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

  return (
    <section>
      <SectionTitle kicker="Step 03" title="Who had what?" />

      <div className="check mb-5 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="users" className="h-4 w-4 text-forest" />
          <span className="label">Diners</span>
        </div>
        <form
          className="grid grid-cols-[1fr_auto] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addDiner(name);
          }}
        >
          <input
            className="field"
            placeholder="Name, e.g. Colton"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            aria-label="Diner name"
          />
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            Add
          </button>
        </form>
        <button type="button" className="btn btn-ghost mt-2 min-h-11 w-full text-sm" onClick={() => addDiner(nextSeat())}>
          <Icon name="plus" className="h-4 w-4" /> Add {nextSeat()}
        </button>

        {state.diners.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {state.diners.map((d) =>
              editing === d.id ? (
                <li key={d.id} className="flex items-center gap-1">
                  <input
                    autoFocus
                    className="field w-36"
                    value={d.name}
                    aria-label="Rename diner"
                    enterKeyHint="done"
                    onChange={(e) => dispatch({ type: "renameDiner", id: d.id, name: e.target.value })}
                    onBlur={() => {
                      if (!d.name.trim()) dispatch({ type: "renameDiner", id: d.id, name: "Guest" });
                      setEditing(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                  <button
                    type="button"
                    className="grid h-11 w-11 place-items-center rounded-md text-stamp active:bg-stamp-wash"
                    aria-label={`Remove ${d.name}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      haptic(12);
                      dispatch({ type: "removeDiner", id: d.id });
                      setEditing(null);
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              ) : (
                <li key={d.id}>
                  <button type="button" className="chip" onClick={() => setEditing(d.id)} aria-label={`Edit ${d.name}`}>
                    {d.name}
                    <Icon name="pencil" className="h-3.5 w-3.5 opacity-50" />
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {state.diners.length === 0 ? (
        <p className="rounded-md border-[1.5px] border-dashed border-ink-faint px-4 py-6 text-center text-ink-soft">
          Add the people at the table, then tap their names on each item.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[0.9375rem] text-ink-soft">
            Tap one name to claim an item. Tap several to split it evenly. Use <strong className="text-ink">Shares</strong> for
            uneven splits like 2 of 3 beers.
          </p>
          {result.unassignedItems.length > 0 && (
            <p className="mb-3 font-mono text-sm text-stamp">
              {result.unassignedItems.length} item{result.unassignedItems.length === 1 ? "" : "s"} still unclaimed
            </p>
          )}
          <ul className="space-y-3">
            {state.items.map((item) => {
              const weights = itemWeights(item, state.diners);
              const assigned = weights.some((w) => w > 0);
              const parts = allocate(item.priceCents, weights);
              return (
                <li key={item.id} className={`check p-3 ${assigned ? "" : "border-stamp"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold">
                        {item.qty > 1 && <span className="mr-1 font-mono text-ink-soft">{item.qty}x</span>}
                        {item.name || "Untitled item"}
                      </p>
                      <p className={`label mt-0.5 ${item.kind === "food" ? "text-forest" : "text-mustard"}`}>
                        {item.kind === "food" ? "Food, taxable" : "Drink, tax included"}
                      </p>
                    </div>
                    <Money cents={item.priceCents} className="shrink-0 text-lg font-semibold" />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {state.diners.map((d, i) => {
                      const on = weights[i] > 0;
                      if (item.mode === "custom") {
                        return (
                          <div key={d.id} className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 ${on ? "bg-forest-wash" : ""}`}>
                            <span className="truncate font-semibold">{d.name}</span>
                            <span className="flex items-center gap-2">
                              {on && <Money cents={parts[i]} className="text-sm text-ink-soft" />}
                              <Stepper
                                label={`${d.name} shares`}
                                value={item.shares[d.id] ?? 0}
                                onChange={(weight) => dispatch({ type: "setShare", itemId: item.id, dinerId: d.id, weight })}
                              />
                            </span>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={d.id}
                          type="button"
                          className="chip"
                          aria-pressed={on}
                          onClick={() => {
                            haptic();
                            dispatch({ type: "toggleShare", itemId: item.id, dinerId: d.id });
                          }}
                        >
                          {on && <Icon name="check" className="h-4 w-4" />}
                          {d.name}
                          {on && weights.filter((w) => w > 0).length > 1 && (
                            <span className="font-mono text-xs tabular-nums opacity-80">
                              <Money cents={parts[i]} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Segmented
                      label="Split type"
                      value={item.mode}
                      onChange={(mode) => dispatch({ type: "setMode", itemId: item.id, mode })}
                      options={[
                        { value: "equal", label: "Even" },
                        { value: "custom", label: "Shares" },
                      ]}
                    />
                    <div className="ml-auto flex gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost min-h-11 px-2.5 text-sm"
                        onClick={() => {
                          haptic();
                          dispatch({ type: "assignAll", itemId: item.id });
                        }}
                      >
                        Everyone
                      </button>
                      {assigned && (
                        <button
                          type="button"
                          className="btn btn-ghost min-h-11 px-2.5 text-sm text-ink-soft"
                          onClick={() => dispatch({ type: "clearShares", itemId: item.id })}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
