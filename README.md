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
| `NEXT_PUBLIC_DONATE_URL`, `NEXT_PUBLIC_DONATE_LABEL` | The Buy Me a Coffee page and the button text (default "Buy me a compute") |
| `NEXT_PUBLIC_UPI_ID`, `NEXT_PUBLIC_UPI_NAME` | Optional UPI ID: adds a "Pay by UPI" button that opens the visitor's UPI app |
| `BMC_WEBHOOK_SECRET` | Secret of the Buy Me a Coffee webhook (required for tracking payments) |
| `BMC_EXCHANGE_RATES` | Converts Buy Me a Coffee payments into `FUNDING_CURRENCY`, e.g. `USD=84,EUR=91` |
| `BMC_ACCEPT_TEST_EVENTS` | `true` to record Buy Me a Coffee test events while setting up |
| `NEXT_PUBLIC_GITHUB_SPONSORS_URL` | The GitHub Sponsors page, e.g. `https://github.com/sponsors/amayakulkarni`; shows a "Sponsor on GitHub" button on `/funding` and `/development` |
| `GITHUB_SPONSORS_WEBHOOK_SECRET` | Secret of the GitHub Sponsors webhook (required for tracking sponsorships) |
| `EXCHANGE_RATES` | Converts foreign payments into `FUNDING_CURRENCY` for both Buy Me a Coffee and GitHub Sponsors, e.g. `USD=84,EUR=91` (falls back to `BMC_EXCHANGE_RATES`) |
| `ADMIN_TOKEN` | Secret for `/admin` and the admin API (16+ characters) |
| `DATABASE_PATH` | SQLite file for the treasury, default `./data/closet-republic.db` |
| `FUNDING_CURRENCY`, `FUNDING_TIMEZONE` | Default `INR` and `Asia/Kolkata` (when the month rolls over) |
| `FUNDING_GOAL`, `LEGAL_FUND_GOAL` | Starting goals; after that, set them on `/admin` |
| `COMMUNITY_REDDIT_URL`, `COMMUNITY_FORUM_URL`, `COMMUNITY_FORUM_NAME` | Public places for ideas, linked on the contribute tabs. Empty Reddit shows "link coming soon"; an empty forum falls back to Stage |
| `NEXT_PUBLIC_STAGE_URL` | Stage, the community forum (default `https://stage.closetrepublic.com`): navbar icon, homepage widget and `/development`. Read at build time |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Any SMTP provider for contributor emails; email is off while `SMTP_HOST` is empty |
| `MAIL_FROM` | Sender, e.g. `Closet Republic <hello@closetrepublic.com>` |
| `CONTRIBUTIONS_EMAIL`, `MAIL_REPLY_TO` | Inbox for new-contributor alerts (and contributors' replies); optional separate reply-to |
| `SITE_URL` | Public site URL for social previews, defaults to `https://closetrepublic.com` |

## Nature mode

One site-wide switch, like dark/light mode, remembered in a cookie. It is **off by default** (monochrome) when no mode has been chosen; the Nature switch, `?nature=true` or a `/nature` URL turns it on.

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
| `/funding` | Budget text from the page/post `finance` (nature: `finance-nature`), pay and UPI buttons, this month's budget and the legal fund (from the treasury), every Ghost author as seeking funding |
| `/lawmakers`, `/lawmakers/<author-slug>` | Ghost authors: name, photo, bio, location, website and social links, and their posts |
| `/passport` | Passport generator (no Ghost content) |
| `/timeline` | Goals and a dated timeline (past and upcoming), managed on `/admin`; not from Ghost |
| `/lifeline` | Lifeline sign-up (nature: Emergency Broadcast System): email, optional name. `/lifeline/unsubscribe?token=…` lets people leave |
| `/development` | How to contribute code, linking the GitHub repository (no Ghost content) |
| `/development/constitution`, `/writing`, `/art` | A sign-up form per area: name, pronouns, email and a public portfolio link only (no uploads, no free text), with the rules about public work, verification and sharing ideas in public |

`/gazetee`, `/pass`, `/goals`, `/roadmap` and `/contribute` redirect to `/gazette`, `/passport`, `/timeline` and `/development`.

## Newsletter

The site runs its own newsletter (`src/lib/newsletter.ts`). Ghost is used only as the source of posts.

- **Sign-up:** the box at the top of `/gazette` and under every post posts the address to `POST /api/newsletter`. The address is stored as `pending` in SQLite and a confirmation link (`/newsletter/confirm?c=…`) is emailed. The link opens a page with a button, so link scanners cannot subscribe anyone. Unconfirmed sign-ups are deleted after 7 days. After a successful sign-up the box turns into an offer for the paid Discord server (`/funding#membership`).
- **Unsubscribe:** every issue carries `/newsletter/unsubscribe?c=…` and `List-Unsubscribe` / `List-Unsubscribe-Post` headers (one-click). Unsubscribed addresses are deleted after 30 days.
- **Sending:** Mailgun HTTP API, one message per subscriber, open and click tracking off (`src/lib/mailgun.ts`). Set `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `NEWSLETTER_FROM` and, for EU domains, `MAILGUN_REGION=eu`. Verify the sending domain in Mailgun (SPF and DKIM) before the first issue.
- **Composing:** `/admin` > Newsletter. Pick posts with the checkboxes (Feature: picture, excerpt and button. Recommend: a short link list), narrow the list with the search box and the "Published in the last N days" filter, preview, send a test, then send. Posts are re-read from Ghost on the server by slug. The page shows subscribers (search, delete, CSV) and sent issues.
- **Template:** `content/newsletter/template.html` is static email HTML (tables, inline styles, PNG/JPEG images only, no SVG, no JavaScript). Placeholders and the repeatable item blocks are documented in the comment at the top of the file. Replace the file to change the design; no code changes are needed.
- **Environment:** `NEWSLETTER_FREQUENCY` (word in the headline, default `weekly`), `DISCORD_PROMO_PRICE` (default `INR 100 per year`), `NEWSLETTER_DISABLED=true` to hide the boxes. Limit: 5 sign-ups per visitor per hour.
- The landing page has a "Subscribe to the newsletter" button that jumps to the box on `/gazette`.

### Admin sign-in code (two-step)

Set `ADMIN_2FA_EMAIL` to require a second step: after the admin token is accepted, an 8-character one-time code is emailed to that address (through the SMTP settings, with Mailgun only as a fallback when SMTP is not set or fails) and the session starts only when the code is entered. Codes work once, expire after 10 minutes, are stored only as a salted hash, and are burned after 5 wrong guesses. With two-step sign-in on, the bearer token no longer works for `/api/admin/*` scripts unless `ADMIN_ALLOW_BEARER=true`.

## Search engines

- `/robots.txt` (`src/app/robots.ts`) allows everything except `/admin` and `/api/`, and points to the sitemap.
- `/sitemap.xml` (`src/app/sitemap.ts`) lists the fixed pages plus every gazette post, constitution section and lawmaker from Ghost. It refreshes every 30 minutes. Nature editions are left out because they are the same pages in the other mode.
- Both use `SITE_URL` (default `https://closetrepublic.com`). Submit `https://closetrepublic.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools.

## Passport

Runs entirely in the browser (`src/components/passport`, `src/lib/passport-pdf.ts`): nothing is uploaded. People upload a photo or build an Open Peeps avatar, fill in their particulars, take the oath, and get a 6-page A4 PDF:

- Passport pages are 78 × 115 mm (1 cm smaller than a real 88 × 125 mm passport); the booklet has 24 pages.
- Sheet 1 (photo paper works well): front has pages 24 + 1 and 22 + 3, back has 2 + 23 and 4 + 21. Page 1 is the cover with the white CR logo, 2 the agreement with the GCR, 3 a copy of the cover, 4 the identity page with an MRZ, 21 spouse and address, 22 a stamp page, 23 blank, 24 the back cover in the cover colour.
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
- **Welfare fund:** a running balance shared between two pots: developers, artists, writers and interns (80%) and need-based help for queer people (20%). Money received is split by that percentage (change it on `/admin`); for each payout, record a deduction and pick the pot it came from. `/funding` shows both pots.
- **Infrastructure fund:** a running balance for computers, tablets, accessories, servers and other equipment.
- **Buy Me a Coffee:** each payment (payment, membership, extra) adds to the fund chosen on `/admin` (monthly budget by default); refunds take it back out. Retries are ignored. Payments in other currencies are converted with `EXCHANGE_RATES`.
- **GitHub Sponsors:** a new sponsorship adds its first payment (in USD, converted with `EXCHANGE_RATES`) to the same fund. Monthly sponsors get one entry per month while they stay active, added the first time the treasury is read in a new month. Tier changes apply from the next month. Because GitHub doesn't send renewal events, a sponsor who cancels may get one extra month recorded if the cancellation arrives late; delete that entry on `/admin`. Private sponsors appear as "Private sponsor"; public ones are thanked by name on `/funding`. `.github/FUNDING.yml` adds the Sponsor button on the repository.

### Admin page

`/admin` (not linked anywhere): sign in with `ADMIN_TOKEN`. Add credits or deductions to any fund, set the legal, welfare or infrastructure fund to an exact balance, change goals, the welfare split and where donations go, browse and delete ledger entries, and see past months.

### Public expense ledger

`/funding/ledger` lists every deduction and refund (date, fund, amount and the entry's note), newest first and grouped by month. Donors, sources and income are never shown. Notes entered on `/admin` are public, so personal details stay out of them. Balance corrections and money received are not listed individually.

### Crypto memberships (BTCPay Server)

A self-hosted BTCPay Server (`deploy/btcpay`) takes Monero, Bitcoin and Lightning. The button on `/funding` and the "Pay with crypto" section on `/discord/link` appear once `BTCPAY_URL`, `BTCPAY_STORE_ID`, `BTCPAY_API_KEY` and `BTCPAY_WEBHOOK_SECRET` are set.

- **Order:** a signed-in Discord member picks a class and 1, 3 or 12 months. `POST /api/crypto/order` stores a `crypto_orders` row (random token, Discord ID, class, months) and creates a 30-minute BTCPay invoice that carries only the token. No name or email is collected.
- **Webhook:** `/api/webhooks/btcpay` checks the `BTCPay-Sig` HMAC, then re-reads the invoice from BTCPay. A settled invoice adds a `discord_grants` row (`granted_by = 'crypto'`, extending the current crypto grant for the same class), a treasury entry (source `crypto`, USD converted with `EXCHANGE_RATES`), deletes the order and wakes the bot. Each invoice grants once (`crypto_payments`).
- **BTCPay setup:** Store > Settings > Webhooks > Create. Payload URL `https://closetrepublic.com/api/webhooks/btcpay`, events "An invoice has been settled" and "A payment has been settled", and the secret in `BTCPAY_WEBHOOK_SECRET`. Create an API key (Account > Manage account > API keys) limited to the store with "Can create invoice" and "Can view invoices".
- **Free-amount payments:** the "Pay with crypto" section on `/funding` (and the Bitcoin button of the support widget) posts a USD amount ($1 to $10,000) to `POST /api/crypto/donate`, which creates a BTCPay invoice marked `kind: donation` with no donor details and no sign-in. When BTCPay reports it settled, the same webhook re-reads the invoice and adds one treasury entry (source `crypto`, note "Crypto donation", fund chosen on `/admin`, USD converted with `EXCHANGE_RATES`). Each invoice counts once.
- **Not granted automatically:** underpaid, late (expired) and unmatched payments. They are logged (`[btcpay] settled invoice without a matching order`) and refunded by hand.
- Prices are fixed in `src/lib/btcpay.ts` (`CRYPTO_TIERS`).

### Discord membership

Buy Me a Coffee members get their class role (Alien, Citizen, Top 1%, Upper Middle Class, Middle Class) and lounges in the Discord server automatically.

- **Webhook:** the existing `/api/webhooks/buymeacoffee` now also stores `membership.*` events in the `memberships` table, emails new members who haven't linked Discord yet (once), wakes the bot, and forwards every verified event to the forum bridge (`FORUM_BRIDGE_URL`, `FORUM_BRIDGE_SECRET`). Tick all `membership.*` events on the Buy Me a Coffee webhook, and leave Buy Me a Coffee's own Discord connection off.
- **Linking:** `/discord/link` (also `/link` in Discord): sign in with Discord (scope `identify`), type the Buy Me a Coffee email, type the 6-digit code sent to that email. Only the Discord ID and that email are stored (`discord_members`). Needs `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, SMTP, and the redirect `https://closetrepublic.com/discord/callback` added in the Discord developer portal under OAuth2.
- **Bot:** `bot/index.mjs`, a second pm2 app (`cr-discord-bot`). It compares each linked member's membership with their roles and fixes the difference: on every webhook, link, server join, and every 15 minutes. Class role plus the access role of that class and every cheaper one. Cancelled or paused memberships keep their class until the paid period ends, then a 7-day grace period (DMs on day 0 and day 5), then the roles are removed. With `BMC_API_TOKEN` it also checks Buy Me a Coffee every hour. It never touches staff, pronoun or other roles. Commands: `/link`, `/rank`, `/todo`, `/vc`, `/pomodoro` (see below), `/membership status`, `/membership grant` and `/membership revoke` (Founders), `/discreet on|off`, `/thanks on|off`, `/unlink`, `/forget-me`, `/tiers` (Founders), `/ticket` (see below) and `/unlink member|user_id` (mods).
- **Embassy tickets:** the bot keeps one "Open a ticket" button message in `#open-a-ticket` (edited in place on every start) and `/ticket open` works anywhere. Both open a form (subject, what happened); every reply to the opener is private. The bot creates `ticket-0001` (numbers count up and are never reused) inside the Embassy category, visible only to the opener, Founder, Minister of Order and the bot. Close (`/ticket close [reason]` or the button; opener or mod) removes the opener's Send Messages and renames the channel `closed-0001`. Mods can reopen it, or archive it: the bot saves every message as `ticket-0001.txt` in `#ticket-transcripts`, then deletes the channel. `/ticket list` (mods) shows open and closed tickets. The database `tickets` table (created by the bot) holds only the number, opener ID, channel ID, status and dates; message text exists only in the transcript. Config keys in `config/discord-tiers.json` under `channels`: `ticketCategory`, `ticketDesk`, `ticketTranscripts` (written by `discord/setup/setup-server.mjs`).
- **Mod unlink:** `/unlink member:<member>` or `/unlink user_id:<id>` (optional `reason`) is for Founder and Minister of Order only, checked in the bot. A summary (masked email, class, paid-until) appears with a **Confirm unlink** button. On confirm the link and any grace carry-over are removed, class and lounge roles go at once, one line goes to `#mod-log`, and the user gets a DM. The Buy Me a Coffee record and any `/membership grant` stay. Plain `/unlink` with no member still unlinks the caller with a 7-day grace period.
- **Bot permissions for tickets:** Manage Channels, Manage Roles and Manage Messages on the Embassy category, and Attach Files (to post transcripts). Transcripts need the **Message Content Intent** (Developer Portal > Bot > Privileged Gateway Intents). When it is off the bot logs a warning, starts without it, and transcripts show who wrote what and when but not the text. `BOT_MESSAGE_CONTENT=false` skips the attempt.
- **Ambient sound in the voice rooms:** when a person is in Town hall, Campfire, Hammock, Dictator's bedroom, Jantar Mantar, Cafe or Dark alley, a bot joins that channel and loops its sound. It leaves 20 seconds after the last person goes. Rooms are found by channel name (emoji, case and apostrophes ignored); `config/ambience.json` can set a `channelId` or change a room. Campfire, Hammock, Dictator's bedroom, Cafe and Dark alley also get a small animated picture (fire, beach, clock, coffee brewing, black cat) posted in the channel's chat, deleted when the bot leaves. The channel status line shows a short caption. Discord does not let bots Go Live or share a screen, so the picture and status are the substitute. `/ambience` (mods) lists the rooms and what is playing.
  - **One bot, one room.** A Discord bot can sit in only one voice channel per server. Snitch alone covers one occupied room at a time; the other rooms wait. For several rooms at once, create extra bot applications, invite them to the server and list their tokens, comma separated, in `AMBIENCE_HELPER_TOKENS` (the first token plays the first free room, and so on).
  - **Sound files.** Built-in loops (original, CC0, generated by `scripts/ambience/make-audio.py`) are in `bot/ambience/defaults/`. Own files override them without any code change: put `data/ambience/<room>.mp3` (or `.ogg`, `.wav`, `.flac`, `.m4a`) or a folder `data/ambience/<room>/` (one file is picked at random each time) next to the database. Room names: `town-hall`, `campfire`, `hammock`, `dictators-bedroom`, `jantar-mantar`, `cafe`, `dark-alley`. `data/` is not in git, so licensed tracks never reach the public repository. See `bot/ambience/CREDITS.md`.
  - **Needs:** Node 22.12 or newer (`node -v`), `npm install` (adds `@discordjs/voice` and `ffmpeg-static`; or `AMBIENCE_FFMPEG=/usr/bin/ffmpeg` to use a system ffmpeg), the **Guild Voice States** gateway intent (automatic, no Portal switch), and on the voice channels the permissions View Channel, Connect, Speak, Send Messages, Attach Files and Set Voice Channel Status (plus Mute Members on the Town hall stage so the bot can unmute itself). `AMBIENCE=off` turns the feature off. Loudness: every track is normalised to about -24 LUFS (quiet background level) with a peak limiter at about -2 dB, so no file can be loud; `AMBIENCE_TRIM_DB=-6` lowers all rooms further, and members can turn a bot down for themselves (right-click it in the voice channel).
- **Verification and Elders:** every member passes a two-step check on `/discord/link`: sign in with Discord (step one), then type the email and the 6-digit code sent to it (step two). The date of the first successful check is `linked_at`; it is kept when the same Discord account links again and cleared by `/unlink`. Alien is not free: it is the $1 entry class (per month or per year) on Buy Me a Coffee and on crypto (`CRYPTO_TIERS` in `src/lib/btcpay.ts`: $1 for 1 month, $1 for 12 months; other lengths and classes are priced per month). A verified member with nothing paid stays a Visitor (border channels only). After `elder.afterDays` (90) of verified membership in any class the bot adds the Elder role (`elder.roleId`, managed like the class roles), DMs once, and removes it when the class and its grace period end or the email is unlinked.
- **Tourist by intro:** `tourist` in the config is the free role (`roleId`, `accessRoleId`; optional `introOptionalFields`, a list of field keys such as `gender` or `orientation` that may be left empty, default none). Buy Me a Coffee has no free level, so Tourist never comes from there. The route is a DM to Snitch (also described by `/intro`): the person sends one message in the template `Age`, `Gender`, `Pronouns`, `Orientation`, `Location`, `Education/career`, `Hobbies`, `Trivia`, each on its own line. The bot refuses anyone under 13 unread (nothing saved, no channel), lists missing fields, and otherwise creates `intro-NNNN` in the ticket category (`channels.introCategory`, else `channels.ticketCategory`), visible only to the Founder and Minister of Order roles and the bot, with **Approve** and **Decline** buttons. One intro at a time per person; `cancel` in the DM withdraws it. **Approve** saves the intro as `intro-NNNN.txt` in `#ticket-transcripts` (staff-only; approval is refused if that channel is not configured), deletes the intro channel, sets `tourist_since`, gives the Tourist roles and sends the welcome DM. **Decline** (optional reason in a small form) deletes the channel and the intro, DMs the person kindly and lets them send a new one. Intros nobody decides within 14 days are deleted and the person is told. An approved intro stays in `#ticket-transcripts` until the member asks for its deletion: `/forget-me` deletes the saved message and the record (`intro_records` holds only the message location), and a mod can also delete the message by hand. The database never holds intro text. Requires the Direct Messages gateway intent (automatic; DM text needs no Portal switch). A paid class replaces Tourist, and when a class ends (after the 7-day grace) a member who holds Tourist falls back to it. `/unlink` keeps Tourist. The intro text and the mod channel are the only places the answers exist, so keep `#ticket-transcripts` limited to the mods.
- **The Elder rule:** `elder.afterDays` (90) since the first verification (the Tourist approval or the email link, whichever came first), `elder.activeDaysRequired` (30) active days within `elder.activityWindowDays` (90; an active day has a message or 5 voice minutes), no Discord timeout in that window, and the second verification step: an email confirmed on `/discord/link` (any email the member owns). Members who already hold the Elder role when the rule starts are kept. Activity is counted from the bot's start as per-day numbers only (`discord_activity`, deleted after 120 days; no text, no channels). `elder.grandElderRoleId` is the Grand Elder role (also accepted as `roles.grandElder`): it is given by hand and never given or removed by the bot, and its holders may create private rooms like Elders (the Discord layout gives them the Elder lounges and the office). `elder.creatorRoleIds` (Elder, Founder, Representative, Minister of Order) may create private rooms, named with `elder.privateRoomPrefix` ("Private: "), at most `elder.maxRoomsPerElder` each. The Server Messages and Direct Messages gateway intents are automatic; the Message Content Intent is not needed for either.
- **Private Elder rooms:** an Elder who joins the lobby voice channel (`elder.lobbyChannelId`) gets a room in the Elder category (`elder.categoryId`), visible only to them, and is moved into it. `/room invite|remove|rename|limit|close` manage it. Every private room gets a pinned notice in its text chat when it is created: the text chat is public and only the voice and video are private. Voice channels staff add to the Elder category get the same notice (a few seconds after creation), and at start-up every voice channel in that category that lacks it gets it once. The Snitch role needs Send Messages and Pin Messages there (without Pin Messages the notice is still posted, just not pinned). The room is deleted 15 seconds after it empties; rooms left over at start-up are cleaned. The `elder_rooms` table holds only the channel ID and owner ID. The bot needs Manage Channels, Move Members and Manage Roles on the Elder category.
- **Public voice notice:** in every public voice channel the bot posts, right after the room's picture (or alone), a notice: voice chats are public, do not write or show privileged or sensitive information, do not trust newcomers, report unsolicited DMs to the Embassy. It disappears when the bot leaves. Voice channels in the categories listed under `voiceNotice.categoryIds` (config) that have no ambient room keep one permanent notice instead. The Elder category gets no notice.
- **Hobby picker:** `channels.college` (the `#college` channel) holds one message with a multi-select menu built from `hobbies` in the config (`slug`, `label`, `emoji`, `roleId`). The member ends up with exactly the picked hobby roles; choosing nothing clears them. The Discord layout gives each hobby category to its role, so the channels appear by themselves. Only hobby roles are touched.
- **Helper bots for ambience:** `npm run ambience:helpers` (`node bot/helpers-setup.mjs`) counts the rooms that can play sound (cloned Elder rooms included), how many bots that needs, which helper tokens work, which helpers have not joined the server (with ready-made invite links carrying the right permissions), and what to create next. Discord only allows creating bot applications by hand in the Developer Portal; everything else is automated: put the tokens one per line in `tokens.txt`, run `node bot/helpers-setup.mjs --tokens-file tokens.txt --write-env .env.local`, delete `tokens.txt`, then `pm2 restart cr-discord-bot --update-env`.
- **Beginner guide:** `/discord/link?guide=true` opens a step-by-step Discord guide for phones, `?guide=false` hides it, and without the option it is folded away on the page. Screenshots go in `public/discord-guide/` (file names in the README there) or under `DISCORD_GUIDE_IMAGES_URL`; a labelled placeholder shows until a file exists.
- **To-do lists:** `/todo add|list|done|remove|clear`, with `list:` set to `mine` (default, private) or `voice channel` (the shared list of the voice channel the member sits in, or whose chat the command is typed in). Adding to or ticking off a voice channel list needs being connected to it; removing an unfinished item needs its author or a mod; `clear` removes only the caller's own items unless a mod runs it. Ticking off deletes the item. Limits: 200 characters, 20 personal and 30 voice channel items; unfinished items expire after 30 days (personal) and 14 days (voice channel). The `todos` table (created by the bot) holds only the text, author ID, channel ID and date; `/forget-me` deletes every item the member wrote. Rules in `bot/todos.mjs`.
- **Voice channel tracking:** `/vc status|clear-status|meeting|meeting-end|note` for members connected to that voice channel (or mods). `meeting topic [minutes]` sets the status to "📅 Meeting: topic", posts the channel's to-do list as the agenda, pins that post, and ends by itself after `minutes` (5 to 240), or with `meeting-end`, or when the channel empties; the pin is removed and the status put back. `note` posts a note in the voice chat and pins it. The message menu items **Pin in voice chat** and **Unpin from voice chat** (right-click or long-press a message, then Apps) pin any message in a voice channel's chat for members connected to that channel. Nothing is stored; a meeting ends with a bot restart. Rules in `bot/vc-tools.mjs`.
- **Pomodoro:** `/pomodoro start [focus] [break] [rounds]` (defaults 25, 5, 4; long break of 15 after every fourth block) in an office or coworking voice channel: by default every voice channel whose name contains office, cowork, cafe or study, which on the current server is **office** (Development) and **Cafe** (Recreation District). The Spaces lounges (Roof Top Dining, Tea Stall, Asylum Office and the rest) are text channels and their voice rooms (Hammock, Jantar Mantar, Dark Alley) are lounges, not workspaces, so they are left out. `config/pomodoro.json` (see `config/pomodoro.example.json`) can list exact `channelIds` or other `match` words. During a focus block the bot sets the channel status, posts what is happening with the channel's open to-do items, and server-mutes only members who pressed **Mute me during focus** (or `/pomodoro join`); breaks and the end unmute them, and **Unmute me** (or `/pomodoro leave`) works at any time. A member a moderator already muted cannot opt in, so a mod's mute is never lifted by the Pomodoro. A bot from the ambience pool (Snitch or a Snitch Helper) is called in to play the `cafe` loop and leaves at the end; the Cafe keeps its own sound. If every bot is busy, the session runs without sound. `/pomodoro status` and `/pomodoro stop` (the starter, a mod, or anyone in the channel once the starter has left). The session ends by itself when the channel empties. A server mute follows a member into every voice channel, so a member who leaves during focus is unmuted the next time Discord allows it (when they are in any voice channel); the `pomodoro_mutes` table holds only the user ID and channel ID while the bot's mute lasts, and every mute on record is lifted at start-up. `POMODORO=off` turns it off. Rules in `bot/pomodoro.mjs`.
- **Rank and Elder countdown:** `/rank` (private reply) shows the member's class, its place among the five classes (Alien < Citizen < Top 1% < Upper Middle Class < Middle Class), the days since the first verification and the days left until the Elder role, with the date. It reads only what `/membership status` already uses.
- **Bot permissions for these tools:** on the office and coworking voice channels: View Channel, Connect, Speak, Send Messages, Mute Members and Set Voice Channel Status (the Snitch role has these server-wide); on every voice channel where pins are wanted: **Pin Messages** (or Manage Messages), which the Snitch role does not have yet. The helper bots need View Channel, Connect and Speak on the office channel, which sits in the Development category that the setup script leaves untouched. Slash commands appear after the bot restarts (it registers them at start-up).
- **Config:** copy `discord-tiers.json` from the Discord setup script to `config/discord-tiers.json` (see `config/discord-tiers.example.json`). Levels are matched by name until each level's `bmcLevelIds` is added.
- **Tests:** `npm run test:bot` (rules, database and a fake Discord server).

Start it on the server, after `npm install` and the site restart:

```
pm2 start ecosystem.config.cjs --only cr-discord-bot && pm2 save
pm2 logs cr-discord-bot
```

### Republic Esports League (Discord)

The bot runs the league described in `discord/esports/` (four teams, eight-week seasons, the Closet Cup). Commissioners create matches and enter results; the bot posts fixtures, makes Discord events and match rooms, sends reminders and keeps the standings. The full walkthrough for commissioners is `discord/esports/league-bot.md`.

- **Switch on:** add a `league` block to `config/discord-tiers.json` (see `config/discord-tiers.example.json`): `commissionerRoleId`, `categoryId` (the Republic Esports League category, where match rooms are made), `teams` (`key` and `roleId` per team; names and emoji default for the four standard keys), `channels` (`fixtures`, `scoreboard`, `office`, `matchReports`) and optional `games` (default: Fortnite, Roblox, Genshin Impact, and Minecraft, GTA 6 and Cyberpunk 2077 as side quests that never count for the Cup). The Discord setup script (`discord/setup`) writes this block and the Esports League hobby entry (`requires: gaming`) into `discord-tiers.json`, so only the copy to `config/` is needed. Without `league` there is no `/league` command. Restart the bot afterwards: `pm2 restart cr-discord-bot`.
- **Who may use the write commands:** the League Commissioner role (`commissionerRoleId`) and the staff roles (Founder, Representative, Minister of Order). Everyone can use `/league fixtures` and `/league standings`.
- **`/league schedule game when [kind] [team1] [team2] [week] [note]`:** `when` is India time, `YYYY-MM-DD HH:mm`. Head-to-head needs `team1` and `team2`; `kind:free-for-all` plays all four teams. The bot posts the fixture in `#fixtures` (pinging the playing teams), creates a Discord event (needs the Manage Events permission; the fixture is still posted without it) and stores the match under a number.
- **Reminders and rooms:** one day before and one hour before the start, the bot pings the playing teams in `#league-office`. Fifteen minutes before, it creates the voice room `Match <number>: A vs B` in the league category, visible and joinable only for the two teams and the league crew (everyone else does not see it), and pings the teams. A room nobody closed is removed three hours after the start.
- **`/league result match [winner|draw] [first second third fourth] [best_sport] [late] [forfeit] [penalty]`:** enters the result. Head-to-head: `winner`, or `draw:true`, or `forfeit`. Free-for-all: the four places. `best_sport` is the team the opponents voted kindest, `late` lists teams that did not field a squad on time, `forfeit` is a team that did not play, `penalty` voids a team's points for the match (rulebook rule 6). Team lists take team names or keys separated by commas. Entering a result again corrects it (points are replaced, not added). The bot saves it, deletes the match room, edits the pinned standings message in `#scoreboard` and posts the result in `matchReports` (or `#fixtures`).
- **Points:** head-to-head win 3, draw 2, loss 1; free-for-all 4, 3, 2, 1; +1 for fielding a squad on time (attendance); +1 Best Sport (kindness); a forfeit scores 0 and the other team wins; a penalty gives 0 for that match. Losing therefore always earns at least a point. The table sorts by points, then Best Sport; teams level on both are marked and settled by rock-paper-scissors.
- **`/league cancel match`:** cancels a match not yet played and removes its room and event. **`/league season [name]`:** starts the next season (the table restarts from zero, old results stay). The first call before any match only names season 1.
- **Data:** tables `league_matches`, `league_results` and `league_state` in the bot's database. They hold team keys, the game, times and points. The only member ID is the commissioner who created a fixture; `/forget-me` clears it. No player names, scores per player or screenshots are stored.
- **Hobby picker:** a hobby entry can carry `"requires": "gaming"`. It is then only given while the hobby it requires is picked in the same menu (`Esports League` needs `Gaming`), and is removed with it.

### About and legal pages

`/about`, `/terms`, `/privacy` and `/guidelines` (Community Guidelines and Moderation Charter) are Markdown files in `content/pages/`. Edit them like any Markdown; `{{EMAIL}}`, `{{OPERATOR}}`, `{{COUNTRY}}`, `{{SERVER_COUNTRY}}`, `{{UPDATED}}` and the postal tokens are filled in from `LEGAL_EMAIL`, `LEGAL_OPERATOR`, `LEGAL_COUNTRY`, `LEGAL_SERVER_COUNTRY`, `LEGAL_UPDATED` and `LEGAL_POSTAL_ADDRESS`. After changing the legal text, update `LAST_UPDATED` in `src/lib/pages.ts`.

The Privacy Policy promises some retention periods, which the site enforces itself once a day: unsubscribed Lifeline addresses are deleted after 30 days, declined contributors after 90 days, and the email log after 12 months. It also promises web server logs are kept for at most 14 days: configure the reverse proxy (for example nginx) and pm2 log rotation to match.

### Lifeline

The Lifeline is an email list kept for one job: if closetrepublic.com is taken down, everyone on it gets the new address, the GitHub repository and the payment link. People join on `/lifeline` (also linked from the home page and footer), get one welcome email, and every email has an unsubscribe link plus "reply unsubscribe".

The **Lifeline** tab on `/admin`:

- **Download CSV** (subscribed people; or include those who left). **Keep a copy off the server**: if the site is taken down the server and its database may go too. The tab shows the date of the last download and nags after 30 days. Any mail tool can import the CSV; or use **Copy addresses for BCC** and paste them into BCC (never To or CC).
- **Send an emergency notice**: subject, message, new site address, GitHub, payment link and other resources. **Send a test email** goes to `CONTRIBUTIONS_EMAIL`; the real send emails each subscriber one at a time with their own unsubscribe link, and shows progress.

### Contributors

The **Contributors** tab on `/admin` lists sign-ups from the constitution, writing and art forms. Open each portfolio link to verify the work is theirs (or commissioned by them), then set the status to verifying, verified or declined, add a private note, or delete their details. Sign-ups are limited to 5 per hour per visitor and include a hidden bot trap.

Email (once the SMTP variables are set):

- **New sign-up:** the contributor gets a confirmation that repeats the rules (public links only, verification, ideas go to the public community), and `CONTRIBUTIONS_EMAIL` gets an alert with their details.
- **Verified or declined:** changing the status emails the contributor (untick "Email contributors when they are verified or declined" to skip it). Other statuses send nothing.
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
| `POST /api/admin/lifeline/notice` `{ subject, message, siteUrl?, githubUrl?, donateUrl?, resources?, test? }` | Send the emergency notice (or a test to `CONTRIBUTIONS_EMAIL`) |
| `DELETE /api/admin/lifeline/<id>` | Remove a subscriber |

```bash
curl -X POST https://closetrepublic.com/api/admin/ledger \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"fund":"legal","kind":"deduction","amount":3500,"note":"Court filing fee"}'
```

## Running on the server with pm2

1. `npm install` (builds the SQLite driver for that machine; it needs Node 20.9+), then `npm run build`.
2. Put the production values in `.env.local` next to `package.json`: at least `GHOST_CONTENT_API_KEY`, `ADMIN_TOKEN`, `BMC_WEBHOOK_SECRET`, `NEXT_PUBLIC_DONATE_URL`. Variables starting with `NEXT_PUBLIC_` are baked in at build time, so rebuild after changing them.
3. `pm2 start ecosystem.config.cjs && pm2 save`. The site listens on port 40001; point the reverse proxy (nginx, Caddy…) for closetrepublic.com at it.
4. In Buy Me a Coffee → Settings → Webhooks, add `https://closetrepublic.com/api/webhooks/buymeacoffee`, tick the payment events, and copy the secret into `BMC_WEBHOOK_SECRET`. Set `BMC_ACCEPT_TEST_EVENTS=true` while trying "send test", then back to `false`.
5. GitHub Sponsors (once the Sponsors profile is approved): in github.com/sponsors/amayakulkarni/dashboard → Webhooks, add `https://closetrepublic.com/api/webhooks/github-sponsors`, content type `application/json`, and a secret, which goes into `GITHUB_SPONSORS_WEBHOOK_SECRET`. Set `NEXT_PUBLIC_GITHUB_SPONSORS_URL` to show the buttons.
5. Back up `data/closet-republic.db` (it holds the whole treasury). Keep the `data` folder across redeploys.
