"use client";

/* eslint-disable @next/next/no-img-element */
import type { ScanState } from "./SplitApp";
import { Icon } from "./ui";

export default function ScanStep({
  scan,
  photoUrl,
  hasItems,
  onCancel,
  onManual,
  onResume,
}: {
  scan: ScanState;
  photoUrl: string | null;
  hasItems: boolean;
  onCancel: () => void;
  onManual: () => void;
  onResume: () => void;
}) {
  if (scan.phase === "working") {
    const pct = Math.round(scan.progress.progress * 100);
    return (
      <section aria-live="polite" aria-busy="true" className="space-y-4">
        <div className="check overflow-hidden">
          {photoUrl && (
            <div className="relative max-h-[46dvh] overflow-hidden border-b-[1.5px] border-ink bg-bone">
              <img src={photoUrl} alt="Your receipt photo" className="mx-auto max-h-[46dvh] w-auto object-contain grayscale-[30%]" />
              <div className="pointer-events-none absolute inset-x-0 h-10 animate-[scanline_1.8s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-forest/25 to-transparent" />
            </div>
          )}
          <div className="space-y-3 p-4">
            <div className="flex items-baseline justify-between">
              <p className="font-bold">{scan.progress.status}</p>
              <p className="font-mono text-sm tabular-nums text-ink-soft">{pct}%</p>
            </div>
            <div className="h-3 overflow-hidden rounded-sm border-[1.5px] border-ink bg-card" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div
                className="h-full bg-forest transition-[width] duration-200"
                style={{
                  width: `${Math.max(4, pct)}%`,
                  backgroundImage: "repeating-linear-gradient(-45deg, transparent 0 6px, rgba(255,255,255,.18) 6px 12px)",
                }}
              />
            </div>
            <p className="text-sm text-ink-soft">
              Reading happens on this phone. The first scan downloads the OCR engine once, then it is cached.
            </p>
            <button type="button" onClick={onCancel} className="btn btn-ghost w-full">
              <Icon name="x" className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
        <style>{`@keyframes scanline { 0% { top: -10% } 50% { top: 90% } 100% { top: -10% } }`}</style>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      {scan.phase === "error" && (
        <div role="alert" className="rounded-md border-2 border-stamp bg-stamp-wash p-3 text-[0.9375rem] font-medium text-stamp">
          {scan.message}
        </div>
      )}

      {hasItems && (
        <button type="button" onClick={onResume} className="btn w-full justify-between">
          <span>Resume current check</span>
          <Icon name="arrow-right" />
        </button>
      )}

      <article className="check perf-bottom overflow-hidden pb-4">
        <div className="flex items-center justify-between border-b-[1.5px] border-ink bg-forest px-4 py-2 text-card">
          <span className="label text-card">Guest Check</span>
          <span className="font-mono text-xs">TABLE ___ GUESTS ___</span>
        </div>
        <div className="px-4 pt-5">
          <h2 className="text-[2.35rem] font-black leading-[0.95] tracking-tight [font-stretch:80%]">
            Snap the receipt.
            <br />
            <span className="text-forest">Split it fair.</span>
          </h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
            Food tax only lands on the people who ate. Drinks that already include tax stay clean. Tip follows what
            each person ordered.
          </p>
        </div>

        <ol className="ruled mx-4 mt-5 border-y border-rule font-mono text-sm">
          {[
            ["01", "Snap or upload the receipt"],
            ["02", "Fix any misread lines"],
            ["03", "Tap who had what"],
            ["04", "Copy each Venmo note"],
          ].map(([n, t]) => (
            <li key={n} className="flex items-center gap-3 py-2.5">
              <span className="text-stamp">{n}</span>
              <span className="text-ink">{t}</span>
            </li>
          ))}
        </ol>

        <div className="mx-4 mt-5 flex items-start gap-3">
          <span className="stamp shrink-0 text-[0.625rem] text-forest">Private</span>
          <p className="text-[0.8125rem] leading-snug text-ink-soft">
            Your photo never leaves this device. No accounts, no uploads, no AI tokens. OCR runs in your browser.
          </p>
        </div>
      </article>

      <button type="button" onClick={onManual} className="btn w-full min-h-14 text-base">
        <Icon name="pencil" />
        Skip OCR / Add Items Manually
      </button>
    </section>
  );
}
