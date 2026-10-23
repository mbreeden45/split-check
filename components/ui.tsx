"use client";

import { useEffect, useState, type ReactNode } from "react";
import { centsToInput, formatMoney, toCents } from "@/lib/money";

export function haptic(pattern: number | number[] = 8) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    // Not supported (iOS Safari): the visual press state carries the feedback.
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.fontSize = "16px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatMoney(cents)}</span>;
}

/** Decimal input that keeps the raw text while typing and commits cents. */
export function MoneyInput({
  cents,
  onChange,
  label,
  className = "",
}: {
  cents: number;
  onChange: (cents: number) => void;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState(cents ? centsToInput(cents) : "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(cents ? centsToInput(cents) : "");
  }, [cents, focused]);

  return (
    <input
      aria-label={label}
      className={`field-bare text-right tabular-nums ${className}`}
      inputMode="decimal"
      enterKeyHint="done"
      placeholder="$0.00"
      value={focused ? text : cents ? formatMoney(cents) : ""}
      onFocus={(e) => {
        setFocused(true);
        setText(cents ? centsToInput(cents) : "");
        const el = e.target;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9.,]/g, "");
        setText(v);
        onChange(toCents(v) ?? 0);
      }}
      onBlur={() => setFocused(false)}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`seg ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => {
            if (value !== o.value) haptic();
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = 99,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  const btn = "grid h-9 w-11 place-items-center text-xl text-label disabled:text-label-3";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span className="w-6 text-right tabular-nums" aria-live="polite">
        {value}
      </span>
      <div className="flex items-center rounded-lg bg-fill">
        <button
          type="button"
          className={btn}
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => {
            haptic();
            onChange(Math.max(min, value - 1));
          }}
        >
          <span aria-hidden>−</span>
        </button>
        <span className="h-5 w-px bg-sep" aria-hidden />
        <button
          type="button"
          className={btn}
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => {
            haptic();
            onChange(Math.min(max, value + 1));
          }}
        >
          <span aria-hidden>+</span>
        </button>
      </div>
    </div>
  );
}

export function Section({
  title,
  footer,
  children,
  className = "",
}: {
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-8 ${className}`}>
      {title && <h2 className="section-head">{title}</h2>}
      <div className="group rows">{children}</div>
      {footer && <p className="section-foot">{footer}</p>}
    </section>
  );
}

/** A plain label / value row. */
export function Row({ label, children, strong }: { label: ReactNode; children?: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex min-h-11 items-center justify-between gap-3 px-4 ${strong ? "font-semibold" : ""}`}>
      <span className="min-w-0 truncate">{label}</span>
      <span className={strong ? "" : "text-label-2"}>{children}</span>
    </div>
  );
}

type IconName = "camera" | "image" | "plus" | "trash" | "copy" | "check" | "chevron-left" | "doc";

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };
  switch (name) {
    case "camera":
      return (
        <svg {...common}>
          <path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.2l1.5-2h6.6l1.5 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
          <circle cx="12" cy="12.5" r="3.5" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m20.5 15.5-4.5-4.5-8.5 8.5" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.5h9.2L17.5 7" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
          <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      );
    case "chevron-left":
      return (
        <svg {...common} strokeWidth={2.4}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      );
    case "doc":
      return (
        <svg {...common} strokeWidth={1.5}>
          <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
          <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
        </svg>
      );
  }
}
