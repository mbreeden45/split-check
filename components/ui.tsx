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
  return <span className={`font-mono tabular-nums ${className}`}>{formatMoney(cents)}</span>;
}

/** Decimal input that keeps the raw text while typing and commits cents. */
export function MoneyInput({
  cents,
  onChange,
  label,
  className = "",
  autoFocus,
}: {
  cents: number;
  onChange: (cents: number) => void;
  label: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(cents ? centsToInput(cents) : "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(cents ? centsToInput(cents) : "");
  }, [cents, focused]);

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-ink-faint">
        $
      </span>
      <input
        aria-label={label}
        className="field pl-6 text-right font-mono tabular-nums"
        inputMode="decimal"
        enterKeyHint="done"
        placeholder="0.00"
        autoFocus={autoFocus}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.,]/g, "");
          setText(v);
          onChange(toCents(v) ?? 0);
        }}
        onBlur={() => {
          setFocused(false);
          setText(cents ? centsToInput(cents) : "");
        }}
      />
    </div>
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
          className="flex-1"
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
  return (
    <div className="inline-flex items-center rounded-md border-[1.5px] border-ink bg-card" role="group" aria-label={label}>
      <button
        type="button"
        className="grid h-11 w-11 place-items-center text-xl font-bold disabled:opacity-30"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => {
          haptic();
          onChange(Math.max(min, value - 1));
        }}
      >
        <span aria-hidden>-</span>
      </button>
      <span className="w-7 text-center font-mono text-base font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="grid h-11 w-11 place-items-center text-xl font-bold disabled:opacity-30"
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
  );
}

export function SectionTitle({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="label text-stamp">{kicker}</p>
        <h2 className="text-[1.65rem] font-extrabold leading-tight tracking-tight [font-stretch:88%]">{title}</h2>
      </div>
      {children}
    </header>
  );
}

export function Icon({ name, className = "h-5 w-5" }: { name: "camera" | "image" | "pencil" | "plus" | "trash" | "copy" | "check" | "x" | "arrow-left" | "arrow-right" | "users" | "receipt"; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };
  switch (name) {
    case "camera":
      return (
        <svg {...common}>
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="1" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="m21 16-5-5-9 9" />
        </svg>
      );
    case "pencil":
      return (
        <svg {...common}>
          <path d="M4 20h4L19 9l-4-4L4 16z" />
          <path d="m13.5 6.5 4 4" />
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
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="8" y="8" width="12" height="12" rx="1" />
          <path d="M16 8V4H4v12h4" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 12 5 5 9-10" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "arrow-left":
      return (
        <svg {...common}>
          <path d="M19 12H5m6-6-6 6 6 6" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M5 12h14m-6-6 6 6-6 6" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
          <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.4 3.5 5.2" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...common}>
          <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" />
          <path d="M9 8h6M9 12h6M9 16h3" />
        </svg>
      );
  }
}
