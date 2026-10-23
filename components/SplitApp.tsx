"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STEPS, useCheck, type Step } from "@/lib/store";
import { computeSplit } from "@/lib/split";
import { parseReceiptText } from "@/lib/parser";
import type { OcrProgress } from "@/lib/ocr";
import { Icon, Money, haptic } from "./ui";
import ScanStep from "./ScanStep";
import ItemsStep from "./ItemsStep";
import SplitStep from "./SplitStep";
import TotalsStep from "./TotalsStep";

export type ScanState =
  | { phase: "idle" }
  | { phase: "working"; progress: OcrProgress }
  | { phase: "error"; message: string };

export default function SplitApp() {
  const [state, dispatch] = useCheck();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState>({ phase: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const photoUrlRef = useRef<string | null>(null);

  const result = useMemo(
    () => computeSplit(state.items, state.diners, state.taxCents, state.tip),
    [state.items, state.diners, state.taxCents, state.tip],
  );

  const setPhoto = useCallback((url: string | null) => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = url;
    setPhotoUrl(url);
  }, []);

  // Release the in-memory photo when the app unmounts.
  useEffect(() => () => {
    abortRef.current?.abort();
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.step]);

  const go = useCallback(
    (step: Step) => {
      haptic();
      dispatch({ type: "step", step });
    },
    [dispatch],
  );

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
        setScan({ phase: "error", message: "That file is not an image. Try a photo of the receipt." });
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setPhoto(URL.createObjectURL(file));
      dispatch({ type: "step", step: "scan" });
      setScan({ phase: "working", progress: { status: "Preparing photo", progress: 0 } });
      haptic(10);

      try {
        const { recognizeReceipt } = await import("@/lib/ocr");
        const text = await recognizeReceipt(file, (progress) => {
          if (!controller.signal.aborted) setScan({ phase: "working", progress });
        }, controller.signal);
        if (controller.signal.aborted) return;
        const parsed = parseReceiptText(text);
        dispatch({
          type: "loadParsed",
          items: parsed.items,
          taxCents: parsed.taxCents,
          subtotalCents: parsed.subtotalCents,
          totalCents: parsed.totalCents,
        });
        setScan({ phase: "idle" });
        haptic([10, 40, 10]);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        setScan({
          phase: "error",
          message:
            "Could not read that photo. Check your connection for the one time OCR engine download, or add the items by hand.",
        });
      }
    },
    [dispatch, setPhoto],
  );

  const cancelScan = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setScan({ phase: "idle" });
    setPhoto(null);
  }, [setPhoto]);

  const manual = useCallback(() => {
    haptic();
    if (state.items.length === 0) dispatch({ type: "addItem" });
    dispatch({ type: "step", step: "items" });
  }, [dispatch, state.items.length]);

  const reset = useCallback(() => {
    if (state.items.length > 0 && !window.confirm("Start a new check? This clears every item and diner.")) return;
    abortRef.current?.abort();
    setScan({ phase: "idle" });
    setPhoto(null);
    dispatch({ type: "reset" });
    haptic(10);
  }, [dispatch, setPhoto, state.items.length]);

  const stepIndex = STEPS.findIndex((s) => s.id === state.step);
  const scanning = scan.phase === "working";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="sticky top-0 z-20 border-b-[1.5px] border-ink bg-paper/95 px-4 pb-2 pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-[2px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-black uppercase tracking-tight [font-stretch:75%]">Split Check</h1>
            <span className="font-mono text-[0.6875rem] text-stamp">No. {String(state.items.length).padStart(3, "0")}</span>
          </div>
          <button type="button" onClick={reset} className="btn btn-ghost min-h-11 px-3 text-sm">
            New check
          </button>
        </div>
        <nav aria-label="Steps" className="mt-2 grid grid-cols-4 gap-1">
          {STEPS.map((s, i) => {
            const active = s.id === state.step;
            const disabled = scanning || (i > 0 && state.items.length === 0);
            return (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                aria-current={active ? "step" : undefined}
                onClick={() => go(s.id)}
                className={`flex min-h-11 flex-col items-start justify-center border-t-[3px] px-1 text-left transition-colors disabled:opacity-35 ${
                  active ? "border-forest text-ink" : i < stepIndex ? "border-ink/60 text-ink-soft" : "border-rule-warm text-ink-faint"
                }`}
              >
                <span className="font-mono text-[0.625rem] tabular-nums">0{i + 1}</span>
                <span className="text-[0.8125rem] font-bold leading-none">{s.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 px-4 pb-[calc(var(--safe-bottom)+7.5rem)] pt-5">
        {state.step === "scan" && (
          <ScanStep scan={scan} photoUrl={photoUrl} hasItems={state.items.length > 0} onCancel={cancelScan} onManual={manual} onResume={() => go("items")} />
        )}
        {state.step === "items" && <ItemsStep state={state} dispatch={dispatch} photoUrl={photoUrl} />}
        {state.step === "split" && <SplitStep state={state} dispatch={dispatch} result={result} />}
        {state.step === "totals" && <TotalsStep state={state} dispatch={dispatch} result={result} />}
      </main>

      <BottomBar
        step={state.step}
        scanning={scanning}
        itemCount={state.items.length}
        dinerCount={state.diners.length}
        unassigned={result.unassignedItems.length}
        grandTotal={result.grandTotalCents}
        onFile={handleFile}
        onManual={manual}
        go={go}
      />
    </div>
  );
}

function BottomBar({
  step,
  scanning,
  itemCount,
  dinerCount,
  unassigned,
  grandTotal,
  onFile,
  onManual,
  go,
}: {
  step: Step;
  scanning: boolean;
  itemCount: number;
  dinerCount: number;
  unassigned: number;
  grandTotal: number;
  onFile: (f: File | undefined) => void;
  onManual: () => void;
  go: (s: Step) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    onFile(f);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-ink bg-card/97 pb-[calc(var(--safe-bottom)+0.75rem)] pt-3 shadow-[0_-6px_0_0_rgba(24,24,27,0.04)]">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />
      <input ref={libraryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />
      <div className="mx-auto max-w-xl px-4">
        {step === "scan" && (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button type="button" className="btn btn-primary min-h-14 text-base" disabled={scanning} onClick={() => cameraRef.current?.click()}>
              <Icon name="camera" />
              Snap Receipt
            </button>
            <button type="button" className="btn min-h-14 px-4" disabled={scanning} onClick={() => libraryRef.current?.click()} aria-label="Choose a photo from your library">
              <Icon name="image" />
            </button>
            <button type="button" className="btn btn-ghost col-span-2 min-h-11 text-[0.9375rem] underline decoration-2 underline-offset-4" disabled={scanning} onClick={onManual}>
              Skip OCR / Add Items Manually
            </button>
          </div>
        )}

        {step === "items" && (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button type="button" className="btn min-h-14 px-4" onClick={() => go("scan")} aria-label="Back to scan">
              <Icon name="arrow-left" />
            </button>
            <button type="button" className="btn btn-primary min-h-14 text-base" disabled={itemCount === 0} onClick={() => go("split")}>
              Looks Right, Split It
              <Icon name="arrow-right" />
            </button>
          </div>
        )}

        {step === "split" && (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button type="button" className="btn min-h-14 px-4" onClick={() => go("items")} aria-label="Back to items">
              <Icon name="arrow-left" />
            </button>
            <button type="button" className="btn btn-primary min-h-14 text-base" disabled={dinerCount === 0} onClick={() => go("totals")}>
              {dinerCount === 0 ? "Add a diner first" : unassigned > 0 ? `Tip & Totals (${unassigned} left)` : "Tip & Totals"}
              <Icon name="arrow-right" />
            </button>
          </div>
        )}

        {step === "totals" && (
          <div className="grid grid-cols-[auto_1fr] items-center gap-3">
            <button type="button" className="btn min-h-14 px-4" onClick={() => go("split")} aria-label="Back to split">
              <Icon name="arrow-left" />
            </button>
            <div className="flex min-h-14 items-center justify-between rounded-md border-2 border-ink bg-ink px-4 text-card">
              <span className="label text-card/70">Check total</span>
              <Money cents={grandTotal} className="text-xl font-semibold" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
