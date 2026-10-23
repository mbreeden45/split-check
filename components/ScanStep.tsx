"use client";

/* eslint-disable @next/next/no-img-element */
import type { ScanState } from "./SplitApp";
import { Icon } from "./ui";

export default function ScanStep({
  scan,
  photoUrl,
  hasItems,
  onCancel,
  onResume,
}: {
  scan: ScanState;
  photoUrl: string | null;
  hasItems: boolean;
  onCancel: () => void;
  onResume: () => void;
}) {
  if (scan.phase === "working") {
    const pct = Math.round(scan.progress.progress * 100);
    return (
      <section aria-live="polite" aria-busy="true" className="group">
        {photoUrl && (
          <div className="bg-fill">
            <img src={photoUrl} alt="Your receipt photo" className="mx-auto max-h-[45dvh] w-auto object-contain" />
          </div>
        )}
        <div className="px-4 py-4">
          <div className="flex items-baseline justify-between text-[15px]">
            <span>{scan.progress.status}…</span>
            <span className="tabular-nums text-label-2">{pct}%</span>
          </div>
          <div
            className="mt-2 h-1 overflow-hidden rounded-full bg-fill-strong"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.max(3, pct)}%` }} />
          </div>
          <p className="mt-3 text-[13px] text-label-2">
            The first scan downloads the text reader, which can take a few seconds.
          </p>
        </div>
        <button type="button" onClick={onCancel} className="link w-full justify-center border-t border-sep">
          Cancel
        </button>
      </section>
    );
  }

  return (
    <section>
      {scan.phase === "error" && (
        <p role="alert" className="group mb-6 px-4 py-3 text-[15px] text-danger">
          {scan.message}
        </p>
      )}

      {hasItems && (
        <div className="group mb-6">
          <button type="button" onClick={onResume} className="link w-full justify-between px-4">
            Continue current check
            <span className="text-label-3" aria-hidden>›</span>
          </button>
        </div>
      )}

      <div className="flex flex-col items-center px-6 pt-10 text-center">
        <Icon name="doc" className="h-14 w-14 text-label-3" />
        <h2 className="mt-4 text-[22px] font-semibold">Scan a Receipt</h2>
        <p className="mt-2 max-w-xs text-[15px] text-label-2">
          Take a photo, pick one from your library, or paste a screenshot. The items are read on your device and
          the image is never uploaded.
        </p>
        <p className="mt-3 hidden text-[13px] text-label-2 [@media(pointer:fine)]:block">
          You can also press Ctrl+V or ⌘V to paste.
        </p>
      </div>
    </section>
  );
}
