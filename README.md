# Split Check

Snap a receipt, fix the lines, tap who had what, and copy a Venmo note for each person.
Food tax only lands on the people who ate food. Drinks that already include tax stay clean.
Tip follows what each person ordered.

- **Zero AI tokens.** OCR runs in the browser with `tesseract.js` (WebAssembly), loaded on demand.
- **Zero server storage.** Photos are read into memory with `URL.createObjectURL` and a canvas, never uploaded, and the object URL is revoked on cancel, new photo, or New check. The check itself (items, diners, tip) is kept only in this browser's `localStorage` so a reload does not lose it.
- **Static site.** No API routes, no database, no environment variables.

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4.

## How the split works

| Piece | Rule |
| --- | --- |
| Items | Each line is **Food (Taxable)** or **Drink (Tax Included)**. Tap one name to claim it, several to split evenly, or switch to **Shares** for uneven splits (for example 2 of 3 beers). |
| Food tax | `myFoodSubtotal / totalFoodSubtotal * totalTax`. Drink only diners pay $0.00 tax. If there is tax but no food lines, tax falls back to all items and the app warns you. |
| Tip | 18%, 20%, 25%, custom % or custom $. Basis defaults to **after tax** (how Toast and most modern POS slips calculate it); switch to before tax if you like. The tip is split by each diner's item subtotal. |
| Rounding | Every split uses the largest remainder method in whole cents, so the per person totals always add up to the check total exactly. |
| Unclaimed items | Shown in red with the exact amount (items plus their tax and tip) that nobody is covering yet. |

The OCR parser (`lib/parser.ts`) matches lines shaped like `(\d+)?\s*(.+?)\s+\$?(\d+\.\d{2})`, hardened for real OCR output (`2x` quantities, `S` read as `$`, comma decimals, trailing tax flags). It pulls Subtotal, Tax and Total out as summary values instead of items, skips payment and suggested tip lines, and guesses Food vs Drink from the name. You always get an editable review list afterward.

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

## Privacy notes

- The first scan downloads the Tesseract WASM engine and English model (about 10 to 15 MB) from the jsDelivr CDN, and the browser caches it after that. Only the engine is downloaded. Your photo is never sent anywhere.
- The photo exists only as an in-memory object URL and is released on cancel, new scan, or New check. Photos are never written to storage.
