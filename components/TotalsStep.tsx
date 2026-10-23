"use client";

import { useState, type Dispatch } from "react";
import type { Action, CheckState } from "@/lib/store";
import type { DinerBreakdown, SplitResult } from "@/lib/split";
import type { TipConfig } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { tipLabel, venmoMessage } from "@/lib/venmo";
import { Icon, Money, MoneyInput, Row, Section, Segmented, copyText, haptic } from "./ui";

const PRESETS = ["18", "20", "25"] as const;
type Choice = (typeof PRESETS)[number] | "custom";

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
  const isPreset = tip.mode === "percent" && PRESETS.includes(String(tip.percent) as (typeof PRESETS)[number]);
  const [custom, setCustom] = useState(!isPreset);
  const setTip = (patch: Partial<TipConfig>) => dispatch({ type: "tip", patch });
  const base = tip.basis === "post" ? result.itemsTotalCents + result.taxCents : result.itemsTotalCents;
  const choice: Choice = custom ? "custom" : (String(tip.percent) as Choice);

  return (
    <>
      <Section
        title="Tip"
        footer="Most card slips calculate tip on the total after tax. Each person's tip follows what they ordered."
      >
        <div className="space-y-3 px-4 py-3">
          <Segmented
            label="Tip basis"
            value={tip.basis}
            onChange={(basis) => setTip({ basis })}
            options={[
              { value: "post", label: "After Tax" },
              { value: "pre", label: "Before Tax" },
            ]}
          />
          <Segmented<Choice>
            label="Tip amount"
            value={choice}
            onChange={(v) => {
              if (v === "custom") {
                setCustom(true);
              } else {
                setCustom(false);
                setTip({ mode: "percent", percent: Number(v) });
              }
            }}
            options={[
              ...PRESETS.map((p) => ({
                value: p,
                label: (
                  <span className="flex flex-col items-center py-1 leading-tight">
                    <span>{p}%</span>
                    <span className="text-[11px] font-normal text-label-2">{formatMoney(Math.round((base * Number(p)) / 100))}</span>
                  </span>
                ),
              })),
              { value: "custom" as const, label: "Custom" },
            ]}
          />
        </div>
        {custom && (
          <div className="flex items-center justify-between gap-3 px-4">
            <Segmented
              label="Custom tip type"
              value={tip.mode}
              onChange={(mode) => setTip({ mode })}
              options={[
                { value: "percent", label: "%" },
                { value: "amount", label: "$" },
              ]}
              className="w-24"
            />
            {tip.mode === "percent" ? (
              <PercentInput value={tip.percent} onChange={(percent) => setTip({ percent })} />
            ) : (
              <MoneyInput label="Tip amount" cents={tip.amountCents} onChange={(amountCents) => setTip({ amountCents })} className="w-32 text-accent" />
            )}
          </div>
        )}
      </Section>

      <Section title="Check">
        <Row label="Items">
          <Money cents={result.itemsTotalCents} />
        </Row>
        <Row label="Tax">
          <Money cents={result.taxCents} />
        </Row>
        <Row label={tipLabel(tip)}>
          <Money cents={result.tipCents} />
        </Row>
        <Row label="Total" strong>
          <Money cents={result.grandTotalCents} />
        </Row>
      </Section>

      {result.unassignedItems.length > 0 && (
        <p role="alert" className="group mb-8 px-4 py-3 text-[15px] text-danger">
          <Money cents={result.unassignedCents} /> isn&apos;t covered by anyone yet. Unclaimed:{" "}
          {result.unassignedItems.map((i) => i.name || "Untitled").join(", ")}.
        </p>
      )}
      {result.taxFallback && (
        <p className="group mb-8 px-4 py-3 text-[15px] text-warn">
          There&apos;s tax but no food items, so tax is split across everything. Mark food lines as Food to fix this.
        </p>
      )}

      {result.diners.map((b) => (
        <PersonSection key={b.diner.id} b={b} tip={tip} venue={state.venue} />
      ))}

      <ShareAll result={result} venue={state.venue} />
    </>
  );
}

function PercentInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <label className="flex items-center gap-1">
      <input
        aria-label="Tip percent"
        className="field-bare w-20 text-right tabular-nums text-accent"
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
      <span className="text-label-2">%</span>
    </label>
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

function PersonSection({ b, tip, venue }: { b: DinerBreakdown; tip: TipConfig; venue: string }) {
  const { copied, copy } = useCopy();

  return (
    <Section
      title={
        <span className="flex justify-between">
          <span className="truncate">{b.diner.name}</span>
          <Money cents={b.totalCents} />
        </span>
      }
    >
      {b.lines.length === 0 ? (
        <p className="px-4 py-3 text-label-2">Nothing claimed.</p>
      ) : (
        <>
          {b.lines.map((l) => (
            <Row key={l.itemId} label={l.portion ? `${l.name} (${l.portion})` : l.name}>
              <Money cents={l.cents} />
            </Row>
          ))}
          <Row label="Tax">
            <Money cents={b.taxCents} />
          </Row>
          <Row label="Tip">
            <Money cents={b.tipCents} />
          </Row>
          <Row label="Total" strong>
            <Money cents={b.totalCents} />
          </Row>
          <button
            type="button"
            className="link w-full justify-center font-semibold"
            onClick={() => copy(venmoMessage(b, tip, venue))}
            aria-live="polite"
          >
            <Icon name={copied ? "check" : "copy"} />
            {copied ? "Copied" : "Copy Venmo Breakdown"}
          </button>
        </>
      )}
    </Section>
  );
}

function ShareAll({ result, venue }: { result: SplitResult; venue: string }) {
  const { copied, copy } = useCopy();
  const people = result.diners.filter((b) => b.lines.length > 0);
  if (people.length < 2) return null;
  const text = [
    `${venue.trim() || "Split Check"}: ${formatMoney(result.grandTotalCents)} total`,
    "",
    ...people.map((b) => `${b.diner.name}: ${formatMoney(b.totalCents)}`),
  ].join("\n");
  return (
    <div className="group">
      <button type="button" className="link w-full justify-center" onClick={() => copy(text)}>
        <Icon name={copied ? "check" : "copy"} />
        {copied ? "Copied" : "Copy Summary for Group Chat"}
      </button>
    </div>
  );
}
