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
| `NEXT_PUBLIC_GOFUNDME_URL` | GoFundMe campaign link, used by the donate / "Pay your unfair tax" button and the embedded GoFundMe widget |
| `GOFUNDME_GOAL`, `GOFUNDME_RAISED`, `GOFUNDME_CURRENCY` | Numbers for the collection widgets. GoFundMe has no public API, so update these by hand |
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
| `/funding` | Budget from the page/post `finance` (nature: `finance-nature`), GoFundMe widgets, every Ghost author as seeking funding |
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
