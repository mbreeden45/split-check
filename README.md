# Split Check

Snap a receipt, fix the lines, tap who had what, and copy a Venmo note for each person.
Tax only lands on the people who ordered taxable items. Drinks whose price already includes tax stay clean.
Tip follows what each person ordered.

- **Zero AI tokens.** OCR runs in the browser with `tesseract.js` (WebAssembly), loaded on demand.
- **Zero server storage.** Photos are read into memory with `URL.createObjectURL` and a canvas, never uploaded, and the object URL is revoked on cancel, new photo, or New check. The check itself (items, diners, tip) is kept only in this browser's `localStorage` so a reload does not lose it.
- **Static site.** No API routes, no database, no environment variables.

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4.

## How the split works

| Piece | Rule |
| --- | --- |
| Items | Each line is **Taxable** or **Tax Included** (for drinks whose price already includes tax). Tap one name to claim it, several to split evenly, or switch to **Shares** for uneven splits (for example 2 of 3 beers). |
| Tax | `myTaxableSubtotal / totalTaxableSubtotal * totalTax`. People with only tax-included drinks pay $0.00 tax. If there is tax but no taxable lines, tax falls back to all items and the app warns you. |
| Tip | 18%, 20%, 25%, custom % or custom $. Basis defaults to **after tax** (how Toast and most modern POS slips calculate it); switch to before tax if you like. The tip is split by each diner's item subtotal. |
| Rounding | Every split uses the largest remainder method in whole cents, so the per person totals always add up to the check total exactly. |
| Unclaimed items | Shown in red with the exact amount (items plus their tax and tip) that nobody is covering yet. |
| Tax check | A live Tax Rate row shows tax / taxable items. If it's outside what's normal (the printed rate, your usual rate from your last few checks, or the general US range of about 5.5% to 12%), a hint says which items are probably marked wrong and offers a one-tap fix. With a known rate it finds the exact items that add up to the untaxed amount (`lib/taxcheck.ts`). |

Before OCR, the photo is cropped to the paper (receipts are bright and colorless, tables usually are not) and its lighting is flattened so shadows and faint thermal ink read cleanly. The parser (`lib/parser.ts`) matches lines shaped like `(\d+)?\s*(.+?)\s+\$?(\d+\.\d{2})`, hardened for real OCR output (`2x` quantities, `S` read as `$`, comma decimals, a little junk after the price). Add-on lines such as `-American Cheese 1.34` are folded into the item above. It reads Subtotal, Tax and Total as summary values and stops at Total, so payment lines and tax summaries are never counted. Drinks are guessed from the name, but if the printed tax only makes sense when drinks were taxed too (checked against the printed rate when there is one), every item is marked Taxable and the app says so. You always get an editable review list afterward.

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # parser and split engine tests (vitest)
npm run typecheck
npm run build
```

To try the camera on your phone during development, open the dev server over your LAN. Note that `navigator.clipboard` needs HTTPS, so on plain HTTP the copy buttons use a fallback.

## Deploy to Vercel (team: Breeden)

The project needs no settings beyond the defaults. Vercel detects Next.js automatically.

### Option A: Git integration (recommended, auto deploys on every push)

1. Go to <https://vercel.com/new> and make sure the scope picker in the top left says **Breeden**.
2. Under **Import Git Repository**, pick **mbreeden45/split-check**. If it is not listed, click **Adjust GitHub App Permissions** and grant the Vercel app access to the repo.
3. Project name: `split-check`. Framework preset: **Next.js** (auto detected). Leave Root Directory as `./`, and leave the build command, output directory and install command on their defaults.
4. No environment variables are needed. Click **Deploy**.
5. When the build finishes you get a `split-check-*.vercel.app` URL. Every push to the production branch redeploys, and other branches get preview URLs.
6. Production branch: by default this is `main`. This work lives on `claude/gracious-brahmagupta-s4nkkb`. Merge it into `main`, or change it under **Project > Settings > Git > Production Branch**.

### Option B: Vercel CLI

```bash
npm i -g vercel
vercel login
cd split-check
vercel link --scope breeden        # create a new project named split-check
vercel                             # preview deploy
vercel --prod                      # production deploy
```

### Add the custom domain in Vercel

1. Open **Project > Settings > Domains** and click **Add Domain**.
2. Enter `split.michaelbreeden.me` (or any name you like, see below) and choose **Connect to an environment: Production**.
3. Vercel shows the DNS record it expects. Keep that tab open for the next section.

## Spaceship Advanced DNS records

`michaelbreeden.me` already uses Spaceship nameservers (`launch1.spaceship.net`, `launch2.spaceship.net`), so you add records in Spaceship and leave the nameservers alone.

In Spaceship: **Launchpad > Domain Manager > michaelbreeden.me > Advanced DNS > Add record**.

### Subdomain (recommended): `split.michaelbreeden.me`

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| CNAME | `split` | `cname.vercel-dns.com` | 30 min (or Auto) |

### Apex domain instead (only if the app should live at the bare domain)

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `76.76.21.21` | 30 min (or Auto) |
| CNAME | `www` | `cname.vercel-dns.com` | 30 min (or Auto) |

Then add both `michaelbreeden.me` and `www.michaelbreeden.me` in Vercel and set one to redirect to the other. The apex already points at your `michaelbreeden` project, so the subdomain is the safer choice.

Notes:

- **Use the value Vercel shows.** Vercel sometimes shows a project specific target such as `abc123.vercel-dns-017.com` instead of `cname.vercel-dns.com`. Both work. If the Domains page shows a specific value, enter that one.
- **TXT verification.** If Vercel asks for a `_vercel` TXT record (this happens when the domain is linked to another Vercel account), add it exactly as shown: Type `TXT`, Host `_vercel`, Value from the Domains page.
- **Remove conflicts.** Delete any existing record with the same host (for example an old `split` A record, or parking records Spaceship added) before adding the new one.
- **Wait.** DNS usually updates within a few minutes, sometimes up to an hour. The Vercel Domains page turns green and issues the HTTPS certificate automatically. You can check with `dig split.michaelbreeden.me +short`.

## Getting paid

On **Tip & Pay**, fill in **Get Paid** once: your name, Venmo, Cash App, PayPal.me, Zelle and whether you take Apple Cash. Then:

- **Send** on each person opens the share sheet (Messages, WhatsApp, Mail) with their breakdown and links that open each app ready to pay you that exact amount: `venmo.com/you?txn=pay&amount=...`, `cash.app/$you/...`, `paypal.me/you/...`. **Copy** puts the same text on the clipboard.
- **Send to Group** writes one message for the group chat: everyone's total with their own Venmo (or first available) link, skipping people already marked paid.
- **Mark Paid** tracks who has paid you, with a running "Collected" total.
- Apple Cash and Zelle can't be started from a web link, so the message shows the amount for them as text.

Your handles are saved only in this browser's localStorage, never on a server, and they survive New Check. **Copy Backup Link** gives you a link with them packed into the URL fragment (`#pay=...`), which browsers never send to a server. Opening it on any device restores them, and the fragment is removed from the address bar right away. On iPhone, add the site to your Home Screen: Safari can clear storage for sites you haven't opened in 7 days, but Home Screen apps keep it.

## Privacy notes

- The first scan downloads the Tesseract WASM engine and English model (about 10 to 15 MB) from the jsDelivr CDN, and the browser caches it after that. Only the engine is downloaded. Your photo is never sent anywhere.
- The photo exists only as an in-memory object URL and is released on cancel, new scan, or New check. Photos are never written to storage.
- The current check, your payment handles, your usual tax rate and whether you've dismissed tips are kept in this browser's localStorage only. Nothing is sent to a server.
