# Closet Republic

The Next.js site for Closet Republic, a parody online country for harmonious people who once had to hide their true selves to fit in a box. Content comes from the Ghost backend at `management-of.closetrepublic.com`.

## Run it

Needs Node 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in GHOST_CONTENT_API_KEY
npm run dev                  # http://localhost:40001
npm run build && npm start   # production, also on port 40001
```

Get the Content API key in Ghost Admin → Settings → Integrations → Add custom integration.

| Variable | What it does |
| --- | --- |
| `GHOST_URL` | Ghost backend, defaults to `https://management-of.closetrepublic.com` |
| `GHOST_CONTENT_API_KEY` | Ghost Content API key (required) |
| `NEXT_PUBLIC_DONATE_URL`, `NEXT_PUBLIC_DONATE_LABEL` | Your Buy Me a Coffee page and the button text (default "Buy me a compute") |
| `NEXT_PUBLIC_UPI_ID`, `NEXT_PUBLIC_UPI_NAME` | Optional UPI ID: adds a "Pay by UPI" button that opens the visitor's UPI app |
| `BMC_WEBHOOK_SECRET` | Secret of the Buy Me a Coffee webhook (required for tracking donations) |
| `BMC_EXCHANGE_RATES` | Converts Buy Me a Coffee payments into `FUNDING_CURRENCY`, e.g. `USD=84,EUR=91` |
| `BMC_ACCEPT_TEST_EVENTS` | `true` to record Buy Me a Coffee test events while setting up |
| `ADMIN_TOKEN` | Secret for `/admin` and the admin API (16+ characters) |
| `DATABASE_PATH` | SQLite file for the treasury, default `./data/closet-republic.db` |
| `FUNDING_CURRENCY`, `FUNDING_TIMEZONE` | Default `INR` and `Asia/Kolkata` (when the month rolls over) |
| `FUNDING_GOAL`, `LEGAL_FUND_GOAL` | Starting goals; after that, set them on `/admin` |
| `SITE_URL` | Public site URL for social previews, defaults to `https://closetrepublic.com` |

## Nature mode

One site-wide switch, like dark/light mode, remembered in a cookie. It is **on by default** when no mode has been chosen.

- The **Nature** switch in the header, or a quick sideways swipe anywhere on a touch screen, toggles it.
- `?nature=true` or `?nature=false` (also `?nature=`) on any URL sets it.
- Any URL ending in `/nature` shows that page's nature edition, e.g. `/gazette/my-post/nature`, `/constitution/2/nature`, `/funding/nature`.
- **On:** the prism theme. The top and bottom of the screen act like a curved prism: white splits into a seven-colour spectrum and other colours split into their own components; the middle stays undistorted. A spectrum circle follows the pointer. (`src/components/PrismLayers.tsx`, bottom of `src/app/globals.css`.)
- **Off:** monochrome black and white; Ghost images are shown in greyscale.
- Screen readers get a description of the current visual effect, and every illustration's alt text describes how it looks in the current mode.

The site is dark only. If a browser or extension forces a theme (forced colours / high contrast, Dark Reader and similar, or injected styles), `src/components/ThemeGuard.tsx` shows the "CR looks best as is…" alert.

## How content maps to Ghost

Nature editions are separate Ghost posts or pages whose slug is the original slug plus `-nature`.

| Site page | Ghost content |
| --- | --- |
| `/` | Newest **featured** post at the top, older featured posts below |
| `/gazette` | All posts except the constitution, finance and `-nature` ones; shows title, excerpt and author link |
| `/gazette/<slug>` | The post; in nature mode `<slug>-nature` if it exists, otherwise a note saying there is no nature edition |
| `/constitution` | Post/page `constitution` as the introduction; lists sections 1…N where N is the number in `constitution-details` |
| `/constitution/1`, `/constitution/1/2` | `constitution-1`, `constitution-1-2`; sub-sections counted by `constitution-1-details` |
| `/constitution/details`, `/constitution/1/details` | `constitution-details`, `constitution-1-details` (the first number in the text is the section count) |
| `/funding` | Budget text from the page/post `finance` (nature: `finance-nature`), donate and UPI buttons, this month's budget and the legal fund (from the treasury), every Ghost author as seeking funding |
| `/lawmakers`, `/lawmakers/<author-slug>` | Ghost authors: name, photo, bio, location, website and social links, and their posts |
| `/passport` | Passport generator (no Ghost content) |

`/gazetee` and `/pass` redirect to `/gazette` and `/passport`.

## Passport

Runs entirely in the browser (`src/components/passport`, `src/lib/passport-pdf.ts`): nothing is uploaded. People upload a photo or build an Open Peeps avatar, fill in their particulars, take the oath, and get a 6-page A4 PDF:

- Passport pages are 78 × 115 mm (1 cm smaller than a real 88 × 125 mm passport); the booklet has 24 pages.
- Sheet 1 (print on photo paper if you like): front has pages 24 + 1 and 22 + 3, back has 2 + 23 and 4 + 21. Page 1 is the cover with the white CR logo, 2 the agreement with the GCR, 3 a copy of the cover, 4 the identity page with an MRZ, 21 spouse and address, 22 a stamp page, 23 blank, 24 the back cover in the cover colour.
- Sheets 2 and 3 hold 16 more stamp pages, four on each side.
- Print double-sided, flip on long edge, at 100%. Cut on the corner marks, fold on the dashed marks, nest the strips in order and staple.

The standard PDF fonts only cover Latin characters; anything else (for example Devanagari) prints as "?" until a Unicode font is embedded.

## Art

- `public/brand`: CR logos. `public/art`: Transhumans illustrations by Pablo Stanley (CC0), shown inverted to white on black.
- `public/peeps`: Open Peeps parts by Pablo Stanley (CC0) for the avatar builder. Re-import them with `node scripts/import-peeps.mjs "<path to Flat Assets/Separate Atoms>"`.

## Treasury: monthly budget and legal fund

Money is tracked in a SQLite ledger (`src/lib/funds.ts`). Every change is an entry, so the history is never overwritten.

- **Monthly budget:** only this month's entries count, so it starts again from zero on the 1st of every month (`FUNDING_TIMEZONE`). Earlier months stay in the history.
- **Legal fund:** a running balance that never resets.
- **Buy Me a Coffee:** each payment (donation, membership, extra) adds to the fund chosen on `/admin` (monthly budget by default); refunds take it back out. Retries are ignored. Payments in other currencies are converted with `BMC_EXCHANGE_RATES`.

### Admin page

`/admin` (not linked anywhere): sign in with `ADMIN_TOKEN`. Add credits or deductions to either fund, set the legal fund to an exact balance, change goals and where Buy Me a Coffee money goes, browse and delete ledger entries, and see past months.

### API

Public:

- `GET /api/funds`: this month's budget (`raised`, `goal`), legal fund (`balance`, `goal`), currency.

Admin (send `Authorization: Bearer <ADMIN_TOKEN>`; amounts in major units, e.g. rupees):

| Call | What it does |
| --- | --- |
| `GET /api/admin/settings` | Settings, current totals and the last 12 months of the budget |
| `PUT /api/admin/settings` `{ budgetGoal?, legalGoal?, donationFund?: "budget" \| "legal" }` | Change goals or where Buy Me a Coffee money goes |
| `GET /api/admin/ledger?fund=legal&month=2026-10` | List entries |
| `POST /api/admin/ledger` `{ fund, kind: "credit" \| "deduction" \| "adjustment", amount, note? }` | Add money, record a deduction, or a signed correction |
| `DELETE /api/admin/ledger/<id>` | Remove a mistaken entry |
| `GET /api/admin/legal-balance` | Legal fund balance |
| `PUT /api/admin/legal-balance` `{ balance, note? }` | Set the legal fund to an exact amount (records the difference) |

```bash
curl -X POST https://closetrepublic.com/api/admin/ledger \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"fund":"legal","kind":"deduction","amount":3500,"note":"Court filing fee"}'
```

## Running on your server with pm2

1. `npm install` (builds the SQLite driver for that machine; it needs Node 20.9+), then `npm run build`.
2. Put the production values in `.env.local` next to `package.json`: at least `GHOST_CONTENT_API_KEY`, `ADMIN_TOKEN`, `BMC_WEBHOOK_SECRET`, `NEXT_PUBLIC_DONATE_URL`. Variables starting with `NEXT_PUBLIC_` are baked in at build time, so rebuild after changing them.
3. `pm2 start ecosystem.config.cjs && pm2 save`. The site listens on port 40001; point your reverse proxy (nginx, Caddy…) for closetrepublic.com at it.
4. In Buy Me a Coffee → Settings → Webhooks, add `https://closetrepublic.com/api/webhooks/buymeacoffee`, tick the payment events, and copy the secret into `BMC_WEBHOOK_SECRET`. Set `BMC_ACCEPT_TEST_EVENTS=true` while you try "send test", then back to `false`.
5. Back up `data/closet-republic.db` (it holds the whole treasury). Keep the `data` folder when you redeploy.
