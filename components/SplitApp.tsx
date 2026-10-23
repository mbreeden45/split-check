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
          drinksTaxed: parsed.drinksTaxed,
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

  // Ctrl+V or Cmd+V anywhere on the scan screen.
  useEffect(() => {
    if (state.step !== "scan" || scan.phase === "working") return;
    const onPaste = (e: ClipboardEvent) => {
      const image = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!image) return;
      e.preventDefault();
      void handleFile(image);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [state.step, scan.phase, handleFile]);

  // Paste button. iOS Safari shows its own "Paste" bubble to confirm.
  const pasteFromClipboard = useCallback(async () => {
    const shortcut = "press Ctrl+V (Cmd+V on a Mac)";
    if (!navigator.clipboard?.read) {
      setScan({ phase: "error", message: `This browser can't read images from the clipboard with a button. On a computer, ${shortcut} instead.` });
      return;
    }
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        await handleFile(new File([blob], `pasted.${type.split("/")[1] || "png"}`, { type }));
        return;
      }
      setScan({ phase: "error", message: "There's no image on your clipboard. Copy the receipt image first, then tap Paste." });
    } catch (err) {
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      setScan({
        phase: "error",
        message: denied
          ? `Clipboard access was blocked. Allow it when your browser asks, or ${shortcut}.`
          : `Couldn't read the clipboard. Try again, or ${shortcut}.`,
      });
    }
  }, [handleFile]);

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

  const scanning = scan.phase === "working";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="material sticky top-0 z-20 border-b border-sep px-4 pb-3 pt-[calc(var(--safe-top)+0.5rem)]">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-bold tracking-tight">Split Check</h1>
          <button type="button" onClick={reset} className="link text-[17px]" disabled={scanning}>
            New
          </button>
        </div>
        <div role="group" aria-label="Steps" className="seg mt-2">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === state.step}
              disabled={scanning || (i > 0 && state.items.length === 0)}
              onClick={() => go(s.id)}
              className="disabled:text-label-3"
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 px-4 pb-[calc(var(--safe-bottom)+8rem)] pt-6">
        {state.step === "scan" && (
          <ScanStep scan={scan} photoUrl={photoUrl} hasItems={state.items.length > 0} onCancel={cancelScan} onResume={() => go("items")} />
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
        onPaste={pasteFromClipboard}
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
  onPaste,
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
  onPaste: () => void;
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

  const stacked = "min-h-[60px] flex-col gap-0.5 px-2 text-[15px]";

  const back = (to: Step, label: string) => (
    <button type="button" className="btn btn-gray w-[50px] px-0" onClick={() => go(to)} aria-label={`Back to ${label}`}>
      <Icon name="chevron-left" />
    </button>
  );

  return (
    <div className="material fixed inset-x-0 bottom-0 z-30 border-t border-sep pb-[calc(var(--safe-bottom)+0.75rem)] pt-3">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />
      <input ref={libraryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />
      <div className="mx-auto max-w-xl px-4">
        {step === "scan" && (
          <div className="grid grid-cols-3 gap-2">
            <button type="button" className={`btn btn-filled ${stacked}`} disabled={scanning} onClick={() => cameraRef.current?.click()}>
              <Icon name="camera" />
              Take Photo
            </button>
            <button type="button" className={`btn btn-tinted ${stacked}`} disabled={scanning} onClick={() => libraryRef.current?.click()}>
              <Icon name="image" />
              Library
            </button>
            <button type="button" className={`btn btn-tinted ${stacked}`} disabled={scanning} onClick={onPaste}>
              <Icon name="paste" />
              Paste
            </button>
            <button type="button" className="btn btn-gray col-span-3" disabled={scanning} onClick={onManual}>
              Skip OCR / Add Items Manually
            </button>
          </div>
        )}

        {step === "items" && (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            {back("scan", "scan")}
            <button type="button" className="btn btn-filled" disabled={itemCount === 0} onClick={() => go("split")}>
              Next: Who Had What
            </button>
          </div>
        )}

        {step === "split" && (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            {back("items", "items")}
            <button type="button" className="btn btn-filled" disabled={dinerCount === 0} onClick={() => go("totals")}>
              {dinerCount === 0 ? "Add People First" : unassigned > 0 ? `Next: Tip (${unassigned} unclaimed)` : "Next: Tip"}
            </button>
          </div>
        )}

        {step === "totals" && (
          <div className="grid grid-cols-[auto_1fr] items-center gap-3">
            {back("split", "split")}
            <div className="flex items-baseline justify-between px-1">
              <span className="text-label-2">Total</span>
              <Money cents={grandTotal} className="text-[22px] font-semibold" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
