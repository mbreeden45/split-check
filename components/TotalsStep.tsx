"use client";

import { useState, type Dispatch } from "react";
import type { Action, CheckState } from "@/lib/store";
import type { DinerBreakdown, SplitResult } from "@/lib/split";
import type { TipConfig } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { tipLabel, venmoMessage } from "@/lib/venmo";
import { Icon, Money, MoneyInput, SectionTitle, Segmented, copyText, haptic } from "./ui";

const PRESETS = [18, 20, 25];

export default function TotalsStep({
  state,
  dispatch,
  result,
}: {
  state: CheckState;
  dispatch: Dispatch<Action>;
  result: SplitResult;
}) {
  const { tip } = state;
  const isPreset = tip.mode === "percent" && PRESETS.includes(tip.percent);
  const [custom, setCustom] = useState(!isPreset);
  const setTip = (patch: Partial<TipConfig>) => dispatch({ type: "tip", patch });
  const base = tip.basis === "post" ? result.itemsTotalCents + result.taxCents : result.itemsTotalCents;

  return (
    <section>
      <SectionTitle kicker="Step 04" title="Tip and pay up" />

      <div className="check mb-5 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="label">Tip based on</span>
          <Segmented
            label="Tip basis"
            value={tip.basis}
            onChange={(basis) => setTip({ basis })}
            options={[
              { value: "post", label: "After tax" },
              { value: "pre", label: "Before tax" },
            ]}
          />
        </div>
        {tip.mode === "percent" && (
          <p className="mt-2 text-right font-mono text-xs text-ink-soft">
            {tip.percent}% of <Money cents={base} />
          </p>
        )}

        <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Tip presets">
          {PRESETS.map((p) => {
            const on = !custom && tip.mode === "percent" && tip.percent === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                className={`btn min-h-14 flex-col gap-0 px-1 ${on ? "btn-ink" : ""}`}
                onClick={() => {
                  setCustom(false);
                  setTip({ mode: "percent", percent: p });
                }}
              >
                <span className="text-lg leading-none">{p}%</span>
                <span className="font-mono text-[0.6875rem] font-medium opacity-75">{formatMoney(Math.round((base * p) / 100))}</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={custom}
            className={`btn min-h-14 px-1 ${custom ? "btn-ink" : ""}`}
            onClick={() => setCustom(true)}
          >
            Custom
          </button>
        </div>

        {custom && (
          <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-2">
            <Segmented
              label="Custom tip type"
              value={tip.mode}
              onChange={(mode) => setTip({ mode })}
              options={[
                { value: "percent", label: "%" },
                { value: "amount", label: "$" },
              ]}
            />
            {tip.mode === "percent" ? (
              <PercentInput value={tip.percent} onChange={(percent) => setTip({ percent })} />
            ) : (
              <MoneyInput label="Tip amount" cents={tip.amountCents} onChange={(amountCents) => setTip({ amountCents })} />
            )}
          </div>
        )}

        <div className="rule-dash my-3" />
        <dl className="space-y-1.5 font-mono text-[0.9375rem]">
          <Row label="Items" cents={result.itemsTotalCents} />
          <Row label="Food tax" cents={result.taxCents} />
          <Row label={tipLabel(tip)} cents={result.tipCents} />
          <div className="flex justify-between border-t-[1.5px] border-ink pt-1.5 text-base font-bold">
            <dt>Total</dt>
            <dd><Money cents={result.grandTotalCents} /></dd>
          </div>
        </dl>
      </div>

      {result.unassignedItems.length > 0 && (
        <div role="alert" className="mb-4 rounded-md border-2 border-stamp bg-stamp-wash p-3 text-stamp">
          <p className="font-bold">
            <Money cents={result.unassignedCents} /> is not covered yet
          </p>
          <p className="mt-0.5 text-sm">
            Unclaimed: {result.unassignedItems.map((i) => i.name || "Untitled").join(", ")}. Go back and tap a name on each.
          </p>
        </div>
      )}
      {result.taxFallback && (
        <p className="mb-4 rounded-md border-[1.5px] border-mustard bg-mustard/15 p-3 text-sm">
          There is tax but no food items, so tax is split across everything. Mark food lines as Food to fix this.
        </p>
      )}

      <ul className="space-y-4">
        {result.diners.map((b) => (
          <DinerCard key={b.diner.id} b={b} tip={tip} venue={state.venue} />
        ))}
      </ul>

      <ShareAll result={result} tip={tip} venue={state.venue} />
    </section>
  );
}

function Row({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd><Money cents={cents} /></dd>
    </div>
  );
}

function PercentInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <div className="relative">
      <input
        aria-label="Tip percent"
        className="field pr-8 text-right font-mono tabular-nums"
        inputMode="decimal"
        enterKeyHint="done"
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          setText(v);
          const n = parseFloat(v);
          onChange(Number.isFinite(n) ? Math.min(100, n) : 0);
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-ink-faint">%</span>
    </div>
  );
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    const ok = await copyText(text);
    if (ok) {
      haptic([8, 30, 8]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      window.prompt("Copy this message:", text);
    }
  };
  return { copied, copy };
}

function DinerCard({ b, tip, venue }: { b: DinerBreakdown; tip: TipConfig; venue: string }) {
  const { copied, copy } = useCopy();
  const empty = b.lines.length === 0;

  return (
    <li className="check perf-bottom overflow-hidden pb-5">
      <div className="flex items-center justify-between border-b-[1.5px] border-ink bg-bone px-4 py-2.5">
        <h3 className="text-lg font-black tracking-tight [font-stretch:85%]">{b.diner.name}</h3>
        <Money cents={b.totalCents} className="text-xl font-bold" />
      </div>

      {empty ? (
        <p className="px-4 py-4 text-sm text-ink-soft">Nothing claimed yet.</p>
      ) : (
        <>
          <ul className="ruled px-4 font-mono text-sm">
            {b.lines.map((l) => (
              <li key={l.itemId} className="flex justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">
                  {l.name}
                  {l.portion && <span className="text-ink-faint"> ({l.portion})</span>}
                </span>
                <Money cents={l.cents} />
              </li>
            ))}
          </ul>
          <dl className="mx-4 mt-1 space-y-1 border-t-[1.5px] border-dashed border-rule-warm pt-2 font-mono text-sm">
            <Row label="Items" cents={b.subtotalCents} />
            <Row label={b.foodCents === 0 && b.taxCents === 0 ? "Tax (drinks only)" : "Food tax"} cents={b.taxCents} />
            <Row label={tipLabel(tip)} cents={b.tipCents} />
          </dl>
          <div className="mx-4 mt-3">
            <button
              type="button"
              className={`btn w-full ${copied ? "btn-ink" : "btn-primary"}`}
              onClick={() => copy(venmoMessage(b, tip, venue))}
              aria-live="polite"
            >
              <Icon name={copied ? "check" : "copy"} />
              {copied ? "Copied" : "Copy Venmo Breakdown"}
            </button>
          </div>
        </>
      )}
    </li>
  );
}

function ShareAll({ result, tip, venue }: { result: SplitResult; tip: TipConfig; venue: string }) {
  const { copied, copy } = useCopy();
  const people = result.diners.filter((b) => b.lines.length > 0);
  if (people.length < 2) return null;
  const text = [
    `${venue.trim() || "Split Check"}: ${formatMoney(result.grandTotalCents)} total`,
    "",
    ...people.map((b) => `${b.diner.name}: ${formatMoney(b.totalCents)}`),
  ].join("\n");
  return (
    <button type="button" className="btn mt-5 w-full" onClick={() => copy(text)}>
      <Icon name={copied ? "check" : "receipt"} />
      {copied ? "Copied" : "Copy group summary"}
    </button>
  );
}
