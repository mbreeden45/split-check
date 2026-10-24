"use client";

import { useEffect, useState } from "react";
import { backupLink, handleSummary, hasAnyHandle, type PayHandles } from "@/lib/pay";
import { Icon, Toggle, copyText, haptic } from "./ui";

const HOME_TIP_KEY = "split-check:home-tip-dismissed";

/** iPhone Safari outside a Home Screen app, where storage can be cleared after 7 days unused. */
function useHomeScreenTip() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setShow(ios && !standalone && !window.localStorage.getItem(HOME_TIP_KEY));
    } catch {
      setShow(false);
    }
  }, []);
  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(HOME_TIP_KEY, "1");
    } catch {
      // Fine: the tip just shows again next time.
    }
  };
  return { show, dismiss };
}

/** One line showing where pay links go, with a button to set up or edit. Used on Scan and Tip & Pay. */
export function GetPaidSummary({ handles, onOpen, className = "" }: { handles: PayHandles; onOpen: () => void; className?: string }) {
  const configured = hasAnyHandle(handles);
  return (
    <div className={`group flex min-h-11 items-center gap-3 px-4 py-2 ${className}`}>
      <div className="min-w-0 flex-1 text-left">
        {configured ? (
          <>
            <p className="text-[13px] text-label-2">Pay links go to{handles.name ? ` ${handles.name}` : ""}</p>
            <p className="truncate text-[15px]">{handleSummary(handles)}</p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-semibold">Set up how you get paid</p>
            <p className="text-[13px] text-label-2">Venmo, Cash App, PayPal, Zelle or Apple Cash. Takes a minute, once.</p>
          </>
        )}
      </div>
      <button type="button" className="link shrink-0 font-semibold" onClick={onOpen}>
        {configured ? "Edit" : "Set Up"}
      </button>
    </div>
  );
}

/**
 * The payment details form, opened from any screen. A bottom sheet on phones and a centered
 * dialog on wide screens. Saved only in this browser.
 */
export default function GetPaidSheet({
  open,
  handles,
  setHandles,
  onClose,
}: {
  open: boolean;
  handles: PayHandles;
  setHandles: (h: Partial<PayHandles>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PayHandles>(handles);
  const [copied, setCopied] = useState(false);
  const homeTip = useHomeScreenTip();

  // Start from the saved details each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setDraft(handles);
    setCopied(false);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
    // Only when the sheet opens; later edits to `handles` come from this sheet itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const configured = hasAnyHandle(handles);
  const canSave = hasAnyHandle({ ...draft, name: "" }) || configured;
  const field = (key: "name" | "venmo" | "cashapp" | "paypal" | "zelle", label: string, placeholder: string, prefix = "") => (
    <label className="flex items-center gap-3 px-4">
      <span className="w-24 shrink-0">{label}</span>
      {prefix && <span className="-mr-2 text-label-2">{prefix}</span>}
      <input
        className="field-bare min-w-0 flex-1"
        placeholder={placeholder}
        value={draft[key]}
        autoComplete="off"
        autoCapitalize={key === "name" ? "words" : "none"}
        autoCorrect="off"
        spellCheck={false}
        inputMode={key === "zelle" ? "email" : "text"}
        enterKeyHint="done"
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="presentation">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="get-paid-title"
        className="relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-bg pb-[calc(var(--safe-bottom)+1rem)] lg:max-w-lg lg:rounded-2xl lg:pb-4"
      >
        <div className="material sticky top-0 z-10 flex items-center justify-between border-b border-sep px-4 py-2">
          <button type="button" className="link" onClick={onClose}>
            Cancel
          </button>
          <h2 id="get-paid-title" className="font-semibold">
            Get Paid
          </h2>
          <button
            type="button"
            className="link font-semibold"
            disabled={!canSave}
            onClick={() => {
              setHandles(draft);
              haptic();
              onClose();
            }}
          >
            Save
          </button>
        </div>

        <div className="px-4 pt-6">
          <section className="mb-8">
            <div className="group rows">
              {field("name", "Your Name", "Optional")}
              {field("venmo", "Venmo", "username", "@")}
              {field("cashapp", "Cash App", "cashtag", "$")}
              {field("paypal", "PayPal.me", "name")}
              {field("zelle", "Zelle", "Phone or email")}
              <div className="flex min-h-11 items-center justify-between gap-3 px-4">
                <span>Apple Cash</span>
                <Toggle label="Accept Apple Cash" checked={draft.appleCash} onChange={(appleCash) => setDraft({ ...draft, appleCash })} />
              </div>
            </div>
            <p className="section-foot">
              Fill in the ones you use. Each person&apos;s message gets links that open the app ready to pay you the
              exact amount. Saved on this device only, never uploaded.
            </p>
          </section>

          {configured && (
            <section className="mb-6">
              <div className="group">
                <button
                  type="button"
                  className="link w-full px-4"
                  onClick={async () => {
                    if (await copyText(backupLink(window.location.origin, handles))) {
                      haptic([8, 30, 8]);
                      setCopied(true);
                    }
                  }}
                >
                  <Icon name={copied ? "check" : "copy"} />
                  {copied ? "Backup Link Copied" : "Copy Backup Link"}
                </button>
              </div>
              <p className="section-foot">
                Keep the backup link in Notes. Opening it restores these details on any device.
                {homeTip.show && (
                  <span className="mt-2 block text-label">
                    Tip: tap Share, then Add to Home Screen. Safari can clear sites you haven&apos;t opened in 7 days,
                    but Home Screen apps keep their data.{" "}
                    <button type="button" className="text-accent" onClick={homeTip.dismiss}>
                      Got it
                    </button>
                  </span>
                )}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
