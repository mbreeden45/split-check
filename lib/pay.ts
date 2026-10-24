import { formatMoney } from "./money";

/** How the person collecting gets paid. Saved only in their own browser. */
export interface PayHandles {
  /** Shown as "Pay Colton:". Optional. */
  name: string;
  venmo: string;
  cashapp: string;
  paypal: string;
  /** Phone number or email registered with Zelle. */
  zelle: string;
  appleCash: boolean;
}

export const EMPTY_HANDLES: PayHandles = { name: "", venmo: "", cashapp: "", paypal: "", zelle: "", appleCash: false };

/** Accept whatever people paste: "@colton", "venmo.com/u/colton", "$colton", "https://paypal.me/colton/5". */
export function cleanHandles(h: Partial<PayHandles>): PayHandles {
  const strip = (v: string | undefined, hosts: RegExp, prefix: RegExp) =>
    (v ?? "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(hosts, "")
      .replace(/^\/+/, "")
      .split(/[/?#\s]/)[0]
      .replace(prefix, "");
  return {
    name: (h.name ?? "").trim().slice(0, 40),
    venmo: strip(h.venmo, /^(account\.)?venmo\.com(\/u)?/i, /^@/),
    cashapp: strip(h.cashapp, /^cash\.app/i, /^\$/),
    paypal: strip(h.paypal, /^paypal\.(me|com\/paypalme)/i, /^@/),
    zelle: (h.zelle ?? "").trim().slice(0, 80),
    appleCash: Boolean(h.appleCash),
  };
}

export function hasAnyHandle(h: PayHandles): boolean {
  return Boolean(h.venmo || h.cashapp || h.paypal || h.zelle || h.appleCash);
}

const amount = (cents: number) => (Math.max(0, cents) / 100).toFixed(2);

export interface PayLink {
  app: "Venmo" | "Cash App" | "PayPal";
  url: string;
}

/** Links that open each app ready to pay the collector this exact amount. */
export function payLinks(h: PayHandles, cents: number, note: string): PayLink[] {
  const links: PayLink[] = [];
  if (h.venmo) {
    const q = new URLSearchParams({ txn: "pay", amount: amount(cents), note });
    links.push({ app: "Venmo", url: `https://venmo.com/${encodeURIComponent(h.venmo)}?${q.toString().replace(/\+/g, "%20")}` });
  }
  if (h.cashapp) links.push({ app: "Cash App", url: `https://cash.app/$${encodeURIComponent(h.cashapp)}/${amount(cents)}` });
  if (h.paypal) links.push({ app: "PayPal", url: `https://paypal.me/${encodeURIComponent(h.paypal)}/${amount(cents)}` });
  return links;
}

/** The "how to pay me" block appended to a message. Empty when no handles are set. */
export function payBlock(h: PayHandles, cents: number, note: string): string[] {
  if (!hasAnyHandle(h)) return [];
  const out = [h.name ? `Pay ${h.name}:` : "Pay me:"];
  for (const l of payLinks(h, cents, note)) out.push(`${l.app}: ${l.url}`);
  if (h.zelle) out.push(`Zelle: ${h.zelle} (${formatMoney(cents)})`);
  if (h.appleCash) out.push(`Apple Cash works too: ${formatMoney(cents)}`);
  return out;
}

/** Where the money goes, for a one-line preview such as "Venmo @colton · Cash App $colton". */
export function handleSummary(h: PayHandles): string {
  const parts: string[] = [];
  if (h.venmo) parts.push(`Venmo @${h.venmo}`);
  if (h.cashapp) parts.push(`Cash App $${h.cashapp}`);
  if (h.paypal) parts.push(`PayPal ${h.paypal}`);
  if (h.zelle) parts.push(`Zelle ${h.zelle}`);
  if (h.appleCash) parts.push("Apple Cash");
  return parts.join(" · ");
}

// Backup link: the handles ride in the URL fragment, which browsers never send to a server.
const FRAGMENT_KEY = "pay=";

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function backupLink(origin: string, h: PayHandles): string {
  return `${origin}/#${FRAGMENT_KEY}${toBase64Url(JSON.stringify(cleanHandles(h)))}`;
}

/** Reads handles from a backup link's fragment, or null if it isn't one. */
export function handlesFromFragment(hash: string): PayHandles | null {
  const frag = hash.replace(/^#/, "");
  if (!frag.startsWith(FRAGMENT_KEY)) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(frag.slice(FRAGMENT_KEY.length)));
    return parsed && typeof parsed === "object" ? cleanHandles(parsed) : null;
  } catch {
    return null;
  }
}
