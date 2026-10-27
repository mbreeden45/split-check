"use client";

import { useState, type Dispatch } from "react";
import type { Action, CheckState } from "@/lib/store";
import type { DinerBreakdown, SplitResult } from "@/lib/split";
import type { TipConfig } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { groupMessage, tipLabel, venmoMessage } from "@/lib/venmo";
import type { PayHandles } from "@/lib/pay";
import { GetPaidSummary } from "./GetPaidSheet";
import { Icon, Money, MoneyInput, Row, Section, Segmented, copyText, haptic, shareText } from "./ui";

const PRESETS = ["18", "20", "25"] as const;
type Choice = (typeof PRESETS)[number] | "custom";

export default function TotalsStep({
  state,
  dispatch,
  result,
  handles,
  onEditPayment,
}: {
  state: CheckState;
  dispatch: Dispatch<Action>;
  result: SplitResult;
  handles: PayHandles;
  onEditPayment: () => void;
}) {
  const { tip } = state;
  const isPreset = tip.mode === "percent" && PRESETS.includes(String(tip.percent) as (typeof PRESETS)[number]);
  const [custom, setCustom] = useState(!isPreset);
  const setTip = (patch: Partial<TipConfig>) => dispatch({ type: "tip", patch });
  const base = tip.basis === "post" ? result.itemsTotalCents + result.taxCents : result.itemsTotalCents;
  const choice: Choice = custom ? "custom" : (String(tip.percent) as Choice);

  return (
    // Wide screens: tip and check summary pinned on the left, people in two columns on the right.
    <div className="lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="lg:sticky lg:top-24">
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
        {result.feesCents !== 0 && (
          <Row label="Fees & discounts">
            <Money cents={result.feesCents} />
          </Row>
        )}
        <Row label={tipLabel(tip)}>
          <Money cents={result.tipCents} />
        </Row>
        <Row label="Total" strong>
          <Money cents={result.grandTotalCents} />
        </Row>
        {Object.values(state.paid).some(Boolean) && (
          <Row label="Collected">
            <span className="text-ok">
              <Money cents={result.diners.filter((b) => state.paid[b.diner.id]).reduce((a, b) => a + b.totalCents, 0)} /> of{" "}
              <Money cents={result.grandTotalCents} />
            </span>
          </Row>
        )}
      </Section>

      <section className="mb-8">
        <h2 className="section-head">Get Paid</h2>
        <GetPaidSummary handles={handles} onOpen={onEditPayment} />
      </section>

      {result.unassignedItems.length > 0 && (
        <p role="alert" className="group mb-8 px-4 py-3 text-[15px] text-danger">
          <Money cents={result.unassignedCents} /> isn&apos;t covered by anyone yet. Unclaimed:{" "}
          {result.unassignedItems.map((i) => i.name || "Untitled").join(", ")}.
        </p>
      )}
      {result.taxFallback && (
        <p className="group mb-8 px-4 py-3 text-[15px] text-warn">
          There&apos;s tax but every item is marked Tax Included, so tax is split across everything. Mark the taxed items as Taxable to fix this.
        </p>
      )}

      <div className="hidden lg:block">
        <ShareAll result={result} venue={state.venue} handles={handles} paid={state.paid} />
      </div>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
        {result.diners.map((b) => (
          <PersonSection
            key={b.diner.id}
            b={b}
            tip={tip}
            venue={state.venue}
            handles={handles}
            paid={Boolean(state.paid[b.diner.id])}
            onTogglePaid={() => dispatch({ type: "togglePaid", dinerId: b.diner.id })}
          />
        ))}
      </div>

      <div className="lg:hidden">
        <ShareAll result={result} venue={state.venue} handles={handles} paid={state.paid} />
      </div>
    </div>
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

/** Feedback for a Send or Copy button: what happened, for a couple of seconds. */
function useFlash() {
  const [flash, setFlash] = useState<string | null>(null);
  const show = (msg: string) => {
    haptic([8, 30, 8]);
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1800);
  };
  const send = async (text: string) => {
    const r = await shareText(text);
    if (r === "shared") show("Sent");
    else if (r === "copied") show("Copied");
    else if (r === "failed") window.prompt("Copy this message:", text);
  };
  const copy = async (text: string) => {
    if (await copyText(text)) show("Copied");
    else window.prompt("Copy this message:", text);
  };
  return { flash, send, copy };
}

function PersonSection({
  b,
  tip,
  venue,
  handles,
  paid,
  onTogglePaid,
}: {
  b: DinerBreakdown;
  tip: TipConfig;
  venue: string;
  handles: PayHandles;
  paid: boolean;
  onTogglePaid: () => void;
}) {
  const { flash, send, copy } = useFlash();
  const message = () => venmoMessage(b, tip, venue, handles);

  return (
    <Section
      title={
        <span className="flex justify-between gap-3">
          <span className="truncate">
            {b.diner.name}
            {paid && <span className="text-ok"> · Paid</span>}
          </span>
          <Money cents={b.totalCents} className={paid ? "text-ok" : ""} />
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
          {b.feesCents !== 0 && (
            <Row label="Fees & discounts">
              <Money cents={b.feesCents} />
            </Row>
          )}
          <Row label="Tip">
            <Money cents={b.tipCents} />
          </Row>
          <Row label="Total" strong>
            <Money cents={b.totalCents} />
          </Row>
          <div className="grid grid-cols-3" aria-live="polite">
            <button type="button" className="link justify-center gap-1 text-[15px] font-semibold" onClick={() => send(message())}>
              <Icon name={flash ? "check" : "share"} />
              {flash ?? "Send"}
            </button>
            <button type="button" className="link justify-center gap-1 text-[15px]" onClick={() => copy(message())}>
              <Icon name="copy" />
              Copy
            </button>
            <button
              type="button"
              className={`link justify-center gap-1 text-[15px] ${paid ? "text-ok" : ""}`}
              aria-pressed={paid}
              onClick={() => {
                haptic(10);
                onTogglePaid();
              }}
            >
              <Icon name="check-circle" />
              {paid ? "Paid" : "Mark Paid"}
            </button>
          </div>
        </>
      )}
    </Section>
  );
}

function ShareAll({
  result,
  venue,
  handles,
  paid,
}: {
  result: SplitResult;
  venue: string;
  handles: PayHandles;
  paid: Record<string, boolean>;
}) {
  const { flash, send, copy } = useFlash();
  const people = result.diners.filter((b) => b.lines.length > 0);
  if (people.length < 2) return null;
  const text = () => groupMessage(result, venue, handles, paid);
  return (
    <div className="group mb-8 grid grid-cols-2" aria-live="polite">
      <button type="button" className="link justify-center font-semibold" onClick={() => send(text())}>
        <Icon name={flash ? "check" : "share"} />
        {flash ?? "Send to Group"}
      </button>
      <button type="button" className="link justify-center border-l border-sep" onClick={() => copy(text())}>
        <Icon name="copy" />
        Copy
      </button>
    </div>
  );
}
