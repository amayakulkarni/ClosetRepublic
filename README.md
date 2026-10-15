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
| `NEXT_PUBLIC_GITHUB_SPONSORS_URL` | Your GitHub Sponsors page, e.g. `https://github.com/sponsors/amayakulkarni`; shows a "Sponsor on GitHub" button on `/funding` and `/development` |
| `GITHUB_SPONSORS_WEBHOOK_SECRET` | Secret of the GitHub Sponsors webhook (required for tracking sponsorships) |
| `EXCHANGE_RATES` | Converts foreign payments into `FUNDING_CURRENCY` for both Buy Me a Coffee and GitHub Sponsors, e.g. `USD=84,EUR=91` (falls back to `BMC_EXCHANGE_RATES`) |
| `ADMIN_TOKEN` | Secret for `/admin` and the admin API (16+ characters) |
| `DATABASE_PATH` | SQLite file for the treasury, default `./data/closet-republic.db` |
| `FUNDING_CURRENCY`, `FUNDING_TIMEZONE` | Default `INR` and `Asia/Kolkata` (when the month rolls over) |
| `FUNDING_GOAL`, `LEGAL_FUND_GOAL` | Starting goals; after that, set them on `/admin` |
| `COMMUNITY_REDDIT_URL`, `COMMUNITY_FORUM_URL`, `COMMUNITY_FORUM_NAME` | Public places for ideas, linked on the contribute tabs; empty shows "link coming soon" |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Any SMTP provider for contributor emails; email is off while `SMTP_HOST` is empty |
| `MAIL_FROM` | Sender, e.g. `Closet Republic <hello@closetrepublic.com>` |
| `CONTRIBUTIONS_EMAIL`, `MAIL_REPLY_TO` | Inbox for new-contributor alerts (and contributors' replies); optional separate reply-to |
| `SITE_URL` | Public site URL for social previews, defaults to `https://closetrepublic.com` |

## Nature mode

One site-wide switch, like dark/light mode, remembered in a cookie. It is **on by default** when no mode has been chosen.

- The **Nature** switch in the header, or a quick sideways swipe anywhere on a touch screen, toggles it.
- `?nature=true` or `?nature=false` (also `?nature=`) on any URL sets it.
- Any URL ending in `/nature` shows that page's nature edition, e.g. `/gazette/my-post/nature`, `/constitution/2/nature`, `/funding/nature`.
- **On:** the prism theme. The top and bottom of the screen act like a curved prism: white melts into a soft pastel spectrum and other colours take a gentle tint of their own; the middle stays undistorted. A soft spectrum glow follows the pointer. Tune it with `--prism-blur`, `--prism-period` and `--prism-strength` at the top of `globals.css`. (`src/components/PrismLayers.tsx`, bottom of `src/app/globals.css`.)
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
| `/timeline` | Goals and a dated timeline (past and upcoming), managed on `/admin`; not from Ghost |
| `/lifeline` | Lifeline sign-up (nature: Emergency Broadcast System): email, optional name. `/lifeline/unsubscribe?token=…` lets people leave |
| `/development` | How to contribute code, linking the GitHub repository (no Ghost content) |
| `/development/constitution`, `/writing`, `/art` | A sign-up form per area: name, pronouns, email and a public portfolio link only (no uploads, no free text), with the rules about public work, verification and sharing ideas in public |

`/gazetee`, `/pass`, `/goals`, `/roadmap` and `/contribute` redirect to `/gazette`, `/passport`, `/timeline` and `/development`.

## Search engines

- `/robots.txt` (`src/app/robots.ts`) allows everything except `/admin` and `/api/`, and points to the sitemap.
- `/sitemap.xml` (`src/app/sitemap.ts`) lists the fixed pages plus every gazette post, constitution section and lawmaker from Ghost. It refreshes every 30 minutes. Nature editions are left out because they are the same pages in the other mode.
- Both use `SITE_URL` (default `https://closetrepublic.com`). Submit `https://closetrepublic.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools.

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

## Treasury: monthly budget, legal, welfare and infrastructure funds

Money is tracked in a SQLite ledger (`src/lib/funds.ts`). Every change is an entry, so the history is never overwritten.

- **Monthly budget:** only this month's entries count, so it starts again from zero on the 1st of every month (`FUNDING_TIMEZONE`). Earlier months stay in the history.
- **Legal fund:** a running balance that never resets.
- **Welfare fund:** a running balance shared between two pots: developers, artists, writers and interns (80%) and need-based help for queer people (20%). Money received is split by that percentage (change it on `/admin`); when you pay someone, record a deduction and pick the pot it came from. `/funding` shows both pots.
- **Infrastructure fund:** a running balance for computers, tablets, accessories, servers and other equipment.
- **Buy Me a Coffee:** each payment (donation, membership, extra) adds to the fund chosen on `/admin` (monthly budget by default); refunds take it back out. Retries are ignored. Payments in other currencies are converted with `EXCHANGE_RATES`.
- **GitHub Sponsors:** a new sponsorship adds its first payment (in USD, converted with `EXCHANGE_RATES`) to the same fund. Monthly sponsors get one entry per month while they stay active, added the first time the treasury is read in a new month. Tier changes apply from the next month. Because GitHub doesn't send renewal events, a sponsor who cancels may get one extra month recorded if the cancellation arrives late; delete that entry on `/admin`. Private sponsors appear as "Private sponsor"; public ones are thanked by name on `/funding`. `.github/FUNDING.yml` adds the Sponsor button on the repository.

### Admin page

`/admin` (not linked anywhere): sign in with `ADMIN_TOKEN`. Add credits or deductions to any fund, set the legal, welfare or infrastructure fund to an exact balance, change goals, the welfare split and where donations go, browse and delete ledger entries, and see past months.

### Discord membership

Buy Me a Coffee members get their class role (Alien, Citizen, Top 1%, Upper Middle Class, Middle Class) and lounges in the Discord server automatically.

- **Webhook:** the existing `/api/webhooks/buymeacoffee` now also stores `membership.*` events in the `memberships` table, emails new members who haven't linked Discord yet (once), wakes the bot, and forwards every verified event to the forum bridge (`FORUM_BRIDGE_URL`, `FORUM_BRIDGE_SECRET`). Tick all `membership.*` events on the Buy Me a Coffee webhook, and leave Buy Me a Coffee's own Discord connection off.
- **Linking:** `/discord/link` (also `/link` in Discord): sign in with Discord (scope `identify`), type the Buy Me a Coffee email, type the 6-digit code we email. Only the Discord ID and that email are stored (`discord_members`). Needs `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, SMTP, and the redirect `https://closetrepublic.com/discord/callback` added in the Discord developer portal under OAuth2.
- **Bot:** `bot/index.mjs`, a second pm2 app (`cr-discord-bot`). It compares each linked member's membership with their roles and fixes the difference: on every webhook, link, server join, and every 15 minutes. Class role plus the access role of that class and every cheaper one. Cancelled or paused memberships keep their class until the paid period ends, then a 7-day grace period (DMs on day 0 and day 5), then the roles are removed. With `BMC_API_TOKEN` it also checks Buy Me a Coffee every hour. It never touches staff, pronoun or other roles. Commands: `/link`, `/membership status`, `/membership grant` and `/membership revoke` (Founders), `/discreet on|off`, `/thanks on|off`, `/unlink`, `/forget-me`, `/tiers` (Founders).
- **Config:** copy `discord-tiers.json` from the Discord setup script to `config/discord-tiers.json` (see `config/discord-tiers.example.json`). Levels are matched by name until you add each level's `bmcLevelIds`.
- **Tests:** `npm run test:bot` (rules, database and a fake Discord server).

Start it on the server, after `npm install` and the site restart:

```
pm2 start ecosystem.config.cjs --only cr-discord-bot && pm2 save
pm2 logs cr-discord-bot
```

### About and legal pages

`/about`, `/terms`, `/privacy` and `/guidelines` (Community Guidelines and Moderation Charter) are Markdown files in `content/pages/`. Edit them like any Markdown; `{{EMAIL}}`, `{{OPERATOR}}`, `{{COUNTRY}}`, `{{SERVER_COUNTRY}}`, `{{UPDATED}}` and the postal tokens are filled in from `LEGAL_EMAIL`, `LEGAL_OPERATOR`, `LEGAL_COUNTRY`, `LEGAL_SERVER_COUNTRY`, `LEGAL_UPDATED` and `LEGAL_POSTAL_ADDRESS`. When you change the legal text, update `LAST_UPDATED` in `src/lib/pages.ts`.

The Privacy Policy promises some retention periods, which the site enforces itself once a day: unsubscribed Lifeline addresses are deleted after 30 days, declined contributors after 90 days, and the email log after 12 months. It also promises web server logs are kept for at most 14 days: configure your reverse proxy (for example nginx) and pm2 log rotation to match.

### Lifeline

The Lifeline is an email list kept for one job: if closetrepublic.com is taken down, everyone on it gets the new address, the GitHub repository and the donation link. People join on `/lifeline` (also linked from the home page and footer), get one welcome email, and every email has an unsubscribe link plus "reply unsubscribe".

The **Lifeline** tab on `/admin`:

- **Download CSV** (subscribed people; or include those who left). **Keep a copy off the server**: if the site is taken down the server and its database may go too. The tab shows when you last downloaded it and nags after 30 days. Any mail tool can import the CSV; or use **Copy addresses for BCC** and paste them into BCC (never To or CC).
- **Send an emergency notice**: subject, message, new site address, GitHub, donation link and other resources. **Send a test to me** goes to `CONTRIBUTIONS_EMAIL`; the real send emails each subscriber one at a time with their own unsubscribe link, and shows progress.

### Contributors

The **Contributors** tab on `/admin` lists sign-ups from the constitution, writing and art forms. Open each portfolio link to verify the work is theirs (or commissioned by them), then set the status to verifying, verified or declined, add a private note, or delete their details. Sign-ups are limited to 5 per hour per visitor and include a hidden bot trap.

Email (once the SMTP variables are set):

- **New sign-up:** the contributor gets a confirmation that repeats the rules (public links only, verification, ideas go to the public community), and `CONTRIBUTIONS_EMAIL` gets an alert with their details.
- **Verified or declined:** changing the status emails the contributor (untick "Email contributors when I verify or decline them" to skip it). Other statuses send nothing.
- **Email button:** write to one contributor and see every email sent to them. Every attempt, including failures, is kept in the `email_log` table.

### Timeline and goals

The **Timeline and goals** tab on `/admin` adds, edits and deletes goals (status planned / in progress / achieved, progress %, optional target date and position) and timeline events (date, title, description, optional link). They live in the same SQLite database. Events dated after today show under "Coming up" on `/timeline`.

### API

Public:

- `GET /api/funds`: this month's budget (`raised`, `goal`), the legal and infrastructure funds (`balance`, `goal`), the welfare fund (`balance`, `goal`, `creators`, `community`, `creatorsPct`), currency.
- `GET /api/roadmap`: goals and timeline events.

Admin (send `Authorization: Bearer <ADMIN_TOKEN>`; amounts in major units, e.g. rupees):

| Call | What it does |
| --- | --- |
| `GET /api/admin/settings` | Settings, current totals and the last 12 months of the budget |
| `PUT /api/admin/settings` `{ budgetGoal?, legalGoal?, welfareGoal?, infrastructureGoal?, welfareCreatorsPct?, donationFund? }` | Change goals, the welfare split (0 to 100) or where donations go (`budget`, `legal`, `welfare`, `infrastructure`) |
| `GET /api/admin/ledger?fund=legal&month=2026-10` | List entries |
| `POST /api/admin/ledger` `{ fund, kind: "credit" \| "deduction" \| "adjustment", amount, note?, pot? }` | Add money, record a deduction, or a signed correction. `pot` (`creators` or `community`) is for welfare payouts |
| `DELETE /api/admin/ledger/<id>` | Remove a mistaken entry |
| `GET /api/admin/legal-balance` | Legal fund balance |
| `PUT /api/admin/legal-balance` `{ balance, note? }` | Set the legal fund to an exact amount (records the difference) |
| `PUT /api/admin/balance` `{ fund: "legal" \| "welfare" \| "infrastructure", balance, note? }` | Set any running fund to an exact amount |
| `GET/POST /api/admin/goals` `{ title, description?, status?, progress?, targetDate?, sortOrder? }` | List or add goals (`status`: `planned`, `in_progress`, `achieved`) |
| `PUT/DELETE /api/admin/goals/<id>` | Change any goal fields, or delete it |
| `GET/POST /api/admin/timeline` `{ date: "2026-10-14", title, description?, link? }` | List or add timeline events |
| `PUT/DELETE /api/admin/timeline/<id>` | Change any event fields, or delete it |
| `GET /api/admin/contributors?area=art&status=new` | List contributor sign-ups |
| `PUT/DELETE /api/admin/contributors/<id>` `{ status?, adminNote?, notify? }` | Update (verified/declined emails them unless `notify: false`) or delete a sign-up |
| `GET/POST /api/admin/contributors/<id>/email` `{ subject, message }` | Emails sent to them, or send a new one |
| `GET /api/admin/lifeline` | Lifeline subscribers, counts and past notices |
| `GET /api/admin/lifeline/export[?all=1]` | The Lifeline list as CSV |
| `POST /api/admin/lifeline/notice` `{ subject, message, siteUrl?, githubUrl?, donateUrl?, resources?, test? }` | Send the emergency notice (or a test to yourself) |
| `DELETE /api/admin/lifeline/<id>` | Remove a subscriber |

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
5. GitHub Sponsors (once your profile is approved): in github.com/sponsors/amayakulkarni/dashboard → Webhooks, add `https://closetrepublic.com/api/webhooks/github-sponsors`, content type `application/json`, and a secret, which goes into `GITHUB_SPONSORS_WEBHOOK_SECRET`. Set `NEXT_PUBLIC_GITHUB_SPONSORS_URL` to show the buttons.
5. Back up `data/closet-republic.db` (it holds the whole treasury). Keep the `data` folder when you redeploy.
