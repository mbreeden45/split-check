"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import type { ScanState } from "./SplitApp";
import { Icon } from "./ui";

export default function ScanStep({
  scan,
  photoUrl,
  hasItems,
  onCancel,
  onResume,
  onFile,
  onPaste,
  onManual,
}: {
  scan: ScanState;
  photoUrl: string | null;
  hasItems: boolean;
  onCancel: () => void;
  onResume: () => void;
  onFile: (f: File | undefined) => void;
  onPaste: () => void;
  onManual: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const idle = scan.phase !== "working";

  // Dropping an image anywhere on the page starts a scan instead of opening the file.
  useEffect(() => {
    if (!idle) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      onFile(Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/")) ?? e.dataTransfer?.files[0]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [idle, onFile]);

  if (scan.phase === "working") {
    const pct = Math.round(scan.progress.progress * 100);
    return (
      <section aria-live="polite" aria-busy="true" className="group lg:mx-auto lg:max-w-lg">
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
    <section className="lg:mx-auto lg:max-w-2xl">
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

      <div className="flex flex-col items-center px-6 pt-10 text-center lg:hidden">
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

      {/* Wide screens: a drop target with the actions inside it. */}
      <div
        className={`hidden flex-col items-center rounded-2xl border-2 border-dashed px-10 py-16 text-center transition-colors lg:flex ${
          dragging ? "border-accent bg-accent/10" : "border-fill-strong bg-cell"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            onFile(f);
          }}
        />
        <Icon name="doc" className={`h-16 w-16 ${dragging ? "text-accent" : "text-label-3"}`} />
        <h2 className="mt-4 text-[24px] font-semibold">{dragging ? "Drop to Scan" : "Drop a Receipt Image Here"}</h2>
        <p className="mt-2 max-w-md text-[15px] text-label-2">
          Or choose a file, or paste a screenshot with Ctrl+V or ⌘V. The items are read on this computer and the
          image is never uploaded.
        </p>
        <div className="mt-8 flex gap-3">
          <button type="button" className="btn btn-filled min-h-11 text-[15px]" onClick={() => fileRef.current?.click()}>
            <Icon name="image" />
            Choose Image
          </button>
          <button type="button" className="btn btn-tinted min-h-11 text-[15px]" onClick={onPaste}>
            <Icon name="paste" />
            Paste
          </button>
        </div>
        <button type="button" className="link mt-4 text-[15px]" onClick={onManual}>
          Skip OCR / Add Items Manually
        </button>
      </div>
    </section>
  );
}
