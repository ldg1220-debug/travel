# Travel Scheduler

Mobile-first trip planner: pick a **🇰🇷 국내 / ✈️ 해외** region, then plan on a
live map (top half) + drag-and-drop daily timeline (bottom half).

## Stack

- Next.js (App Router) + TailwindCSS
- Zustand — itinerary + region state (`src/store/itineraryStore.ts`)
- React Query — trending-places & search data (`src/lib/api.ts`)
- `@dnd-kit/core` — long-press-to-drag scheduling
- Map engines: `@react-google-maps/api` (international) and the Kakao Maps
  JS SDK (domestic), behind a shared `<MapProvider>` (`src/components/map/`)

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without map API keys, both engines fall back to
an offline decorative map so every interaction (tap-to-schedule,
long-press-to-drag, search, region switching) still works end to end. Copy
`.env.example` to `.env.local` and set the relevant keys to see the real
maps:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` → real Google Maps for the 해외 tab
- `NEXT_PUBLIC_KAKAO_MAP_KEY` → real Kakao Maps for the 국내 tab
- `GOOGLE_PLACES_API_KEY` / `KAKAO_REST_API_KEY` → real search results
  instead of the offline name-filtered fallback

## Region architecture

`region: 'domestic' | 'international'` lives in the Zustand store
(`itineraryStore.ts`) and drives three things simultaneously:

1. **Map engine** — `<MapProvider region={region} .../>` renders
   `GoogleMapEngine` or `KakaoMapEngine`. Both share one interface
   (`src/components/map/types.ts`) and reuse the exact same `<PlaceMarker>`
   component (tap → modal, long-press → drag), so scheduling UX is
   identical regardless of which map is mounted.
2. **Trend list** — `/api/trends?region=...` returns the Google-Places-backed
   pipeline output for `international`, or a dummy Seoul dataset
   (`src/lib/mockPlacesDomestic.ts`) for `domestic`.
3. **Search** — `/api/places/search?region=...&q=...` branches to Google
   Places (New) `searchText` or Kakao Local keyword search, falling back to
   an offline name/category filter when the relevant key isn't set.

The itinerary itself (`itineraryState`) isn't region-scoped — its schema
matches the spec exactly (`id, placeId, name, date, time, coordinates`).

## Interactions

- **Tap** a pin → time/date picker modal → **Register Schedule**.
- **Press and hold** a pin (~0.5s, via dnd-kit's `activationConstraint.delay`)
  → the pin lifts (haptic + map panning pauses) → drag it onto an hour slot
  in the timeline to schedule it there.
- **✨ Trending spots** button opens a bottom sheet with the region's
  curated list plus a search box; tapping a result opens the same
  time-picker modal.

## Trend data pipeline (international)

`src/server/pipeline/` implements the zero-cost trend data flow described in
the spec: mock SNS scrape → regex ad-filter (drops `협찬`/`소정의 원고료`/
`디너의여왕`, keeps `내돈내산`/`영수증 리뷰`) → LLM authenticity check →
Google Places (New) `searchText` resolution with a minimal field mask → JSON
DB write. Run it with:

```bash
npm run pipeline
```

This writes `data/trending-places.json`, which `src/lib/server/getTrendingPlaces.ts`
serves to both `/` (ISR, `revalidate = 3600`) and `/api/trends`, so the app
never calls a paid Places API on a user request — only the offline pipeline
run does. Without `GOOGLE_PLACES_API_KEY` / `LLM_API_KEY` set, the pipeline
resolves against small offline fixtures so it's fully testable here; in
production point it at real credentials and run it on a schedule (cron /
GitHub Actions / Vercel Cron).

Swapping the JSON file for Postgres/Supabase only touches two files:
`src/server/pipeline/db.ts` (write) and `src/lib/server/getTrendingPlaces.ts`
(read). The domestic list is a Phase-4 mockup per spec (`더미 데이터`); wire
it to a real Naver blog/Place pipeline the same way when needed.

## Data model

`itineraryState` (Zustand) holds one flat array of:

```ts
{ id, placeId, name, date, time, coordinates: { lat, lng } }
```

## Auth & saved itineraries (Phase 1.5)

Browsing the trend list and drag-and-drop planning both work fully
signed-out — the login modal only appears at the moment you tap **저장**
(save) or **공유** (share), per spec.

- **Auth**: Auth.js v5 (`next-auth@beta`) with Google/Kakao/Apple providers.
  A provider is only registered once its `AUTH_<PROVIDER>_ID` env var is
  set (`src/auth.ts`), so a partially-configured setup doesn't break.
- **DB**: PostgreSQL via the pure-JS `pg` driver + `@auth/pg-adapter`,
  **not Prisma** — retried three times now, same result every time: this
  sandbox's network policy lets `pg`/`npm` traffic through a proxy, but
  Prisma's engine postinstall downloader dials `binaries.prisma.sh` directly
  (confirmed via `NODE_DEBUG=https`) and gets reset by the sandbox firewall
  every time, even though the exact same file downloads fine over the
  proxy with `curl`. `pg` has no native-binary install step, so it was used
  instead. Schema (`src/server/db/schema.sql`) is the standard Auth.js
  Postgres adapter tables (`users`, `accounts`, `sessions`,
  `verification_token`) plus one app table, `itineraries` (`userId`,
  `title`, `region`, `placesData JSONB` — holds the frontend's `schedule`
  array as-is). Run `npm run db:migrate` against `DATABASE_URL` to apply
  it. If your deployment environment can reach Prisma's binary CDN,
  swapping back to Prisma is a straightforward, isolated change — only
  `src/lib/server/db.ts`, `src/auth.ts`'s adapter line, and the two
  `pool.query` call sites (`src/app/api/itineraries/route.ts`,
  `src/app/share/[id]/page.tsx`) touch the DB layer.
- **Save**: `저장` POSTs the current region + itinerary items to
  `/api/itineraries`, which upserts one row per user.
- **Share**: `공유` saves, then copies `/share/{id}` to the clipboard — a
  public, read-only page listing the trip's stops by date
  (`src/app/share/[id]/page.tsx`).

## /planner (shadcn/ui + real Google Maps prototype)

A second screen (`src/app/(app)/planner/`) built from a shadcn/ui +
lucide-react + framer-motion mockup, wired to the same `useItineraryStore`
as the main page — scheduling here updates the same global `items` array.
Its `places` slice is seeded with real Fukuoka/Yufuin coordinates
(`src/lib/mockPlacesFukuokaYufuin.ts`, ~55km apart) instead of the main
app's demo Kyoto list, so `<MapProvider>` (`src/app/(app)/planner/MapProvider.tsx`)
renders a real, unconditional Google Map — no CSS fallback here — with
`fitBounds` on load and an ordered `<Polyline>` route. Requires
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; without it the map area shows a clean
"Failed to load Google Maps" state (this sandbox has no key to test
against, and its headless-browser QA setup doesn't route through the
outbound proxy the way `curl`/`npm` do, so live tile rendering here is
unverified — the loader's error handling is, though).

> This screen originally lived at the standalone route `/travel-scheduler`;
> Phase 7 (below) split it into `/planner` alongside two sibling screens
> under a shared App Bar. Everything in this section and the "Phase 4/5/6"
> sections below describes what was built there — only the route/file paths
> changed, not the behavior.

### Trend curation sheet + Places search (Phase 4)

- **Trend sheet** (`src/app/(app)/planner/TrendSheet.tsx`): a shadcn
  `Sheet` (`src/components/ui/sheet.tsx`) listing hashtag-style trend cards
  from `/api/planner/trends` — a mock endpoint
  (`src/lib/mockTrends.ts`) standing in for a real curated-DB read, and
  deliberately *not* named `/api/trends` since that path is already the
  main app's real pipeline-backed endpoint. Each card reuses the exact same
  `onDown/onUp/onMove` handlers as map pins, so a tap opens the time-picker
  modal and a ~0.5s hold drags it onto the timeline, identically. Cards are
  merged onto the map (`addPlaces` in the store) as soon as they're
  fetched.
- **Places search** (`src/app/(app)/planner/PlacesSearchInput.tsx`):
  Google Places Autocomplete (New) via the JS SDK
  (`google.maps.places.AutocompleteSuggestion`, loaded through
  `MapProvider`'s `libraries: ["places"]`). One
  `AutocompleteSessionToken` is reused across every keystroke of a search
  and discarded once a place is selected; the actual prediction fetch is
  debounced ~400ms. Selecting a result calls `Place.fetchFields()` with an
  explicit field list (`displayName, location, id, types` — name/geometry/
  place_id/category, nothing billed-for that isn't used) rather than
  fetching everything.
- **Adapter** (`src/lib/placeAdapters.ts`): `placeFromGoogleDetails()`
  converts the fetched `google.maps.places.Place` into the app's shared
  `Place` shape (`id, name, category, color, lat, lng, icon`) — the same
  shape every other source (seed data, trend cards, the main app's
  pipeline) produces, so a place from search is indistinguishable from any
  other once it's in the store.

### Budgeting, route optimization, sharing (Phase 5)

- **Budget**: `ItineraryItem.budget?` (JPY, `src/lib/types.ts`) is set from
  a number input in the schedule modal, shown as a per-stop badge on
  timeline cards and summed into a total badge in the timeline header. The
  `placesData` JSONB column's expected per-item shape is documented in
  `src/server/db/schema.sql` — JSONB itself needs no migration for a new
  optional field.
- **Route optimization** (`optimizeRoute` in `src/store/itineraryStore.ts`):
  a nearest-neighbor TSP heuristic (`haversineDistanceMeters`,
  `src/lib/geo.ts`) starting from the day's earliest-scheduled stop. It
  reassigns the *same set* of hour slots already in use to the newly
  ordered stops — it doesn't invent new times — so the map's `<Polyline>`
  (already derived from the sorted schedule) redraws untangled for free.
  Triggered by the timeline's `[✨ 동선 최적화]` button (needs ≥3 stops),
  which shows a toast on completion.
- **Sharing & sync** (`src/app/(app)/planner/[shareToken]/`): `초대하기`
  (auth-gated the same way as the main app's 저장/공유) saves
  the itinerary and ensures a `shareToken` (`crypto.randomUUID()`, unique
  column on `itineraries`) exists, then copies `/planner/{token}`
  to the clipboard. That route mounts the same `PlannerBoard`
  (shared by both routes) with
  `shareToken` set, which polls `/api/itineraries/shared/[shareToken]`
  every 3s (`refetchInterval` — the fastest option that doesn't need a
  WebSocket server or a service like Supabase, per spec) and pushes local
  changes back (debounced 800ms) via a direct `useItineraryStore.subscribe`
  in an effect. An equality-checked snapshot guards both directions against
  feedback loops (applying our own echoed write back, or re-pushing a write
  we just received). It's a capability-URL model — anyone with the link can
  view *and* edit, there's no per-collaborator identity — and a
  collaborator whose local `places` catalog is missing a referenced spot
  (e.g. found via the trip owner's own search) gets a synthesized marker
  for it rather than a silently-missing pin.

### Design-shell merge (post-Phase 5)

The design team's restyled mockup was merged into what was then
`TravelSchedulerBoard.tsx` (renamed `PlannerBoard.tsx` in Phase 7)
as a pure re-skin — every stateful behavior (Zustand store, `optimizeRoute`,
the polling/push sync effects, search, trend sheet, DnD) is untouched;
only Tailwind classes/layout changed:

- **`npx shadcn@latest add input badge` couldn't run**: `ui.shadcn.com` is
  blocked by this sandbox's network policy (`403` at the proxy gateway, same
  class of block as the Prisma binary CDN). `src/components/ui/input.tsx`
  and `badge.tsx` were hand-authored to match the standard shadcn source
  exactly (same `cva`/`cn`/`data-slot` conventions already used by the
  existing hand-authored `button.tsx`/`sheet.tsx`), and `--input` /
  `--muted-foreground` tokens were added to `globals.css` since `Input`
  needs them.
- **Dummy `[동선 최적화]` / `[초대하기]` buttons** in the mockup were wired to
  the real `handleOptimizeRoute` (→ `optimizeRoute(activeDate)`) and
  `handleInvite` (→ save + copy `/planner/{shareToken}`) handlers,
  keeping their existing disabled/login-gated behavior — only the button's
  visual treatment (gradient border pill / circular icon button) came from
  the mockup.
- **The mockup's fake `MEMBERS` avatar stack was intentionally dropped**,
  not merged: it renders hardcoded "You/Aki/Ren" presence avatars with no
  backing data — this app has no real-time "who's currently viewing"
  channel (only itinerary-content polling), so wiring it up would show
  collaborators who aren't actually there.
- Verified with a Playwright pass: registering 3 trend-sheet places through
  the restyled modal (shadcn `Input` with a ¥ prefix) produced correct
  per-stop and total `Badge` amounts (¥1,500 + ¥3,000 + ¥12,000 = ¥16,500),
  clicking the restyled optimize button reordered the timeline and showed
  the toast, and the restyled invite button correctly opened the login gate
  when signed out.

### Transit routing (Phase 6)

- **`calculateTransits`** (`src/lib/transit.ts`) walks the day's sorted
  `schedule` and, for every consecutive pair of stops with at least one free
  hour between them, produces one `TransitBlock` in the first free hour
  after the earlier stop (a pair with no gap — back-to-back hourly slots —
  has nowhere to render one, since every hour is already spoken for).
  `PlannerBoard.tsx` recomputes this from `schedule` on every
  render, the same plain-derived-value pattern already used for
  `orderByPlace`/`totalBudget` in that file — no extra Zustand state or
  `useEffect` needed (and a `useMemo` version was tried first, but the
  React Compiler rejected it: `schedule` is a fresh array every render, so
  the memoization couldn't be proven stable).
- **`estimateTransit`** is the actual fallback used everywhere: Haversine
  distance (`haversineDistanceMeters`, already used by `optimizeRoute`) at a
  flat per-mode average speed — walking under 1.2km, transit (bus/subway,
  with an 8-minute wait/transfer buffer) beyond that. No network call, no
  API key, so the timeline never blocks on anything to paint.
- **`estimateTransitViaGoogle`** shows the real Distance Matrix integration
  (gated on `google.maps.DistanceMatrixService` actually being loaded) but
  is intentionally not wired into any render path — this sandbox has no
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to test it against, and it's designed to
  *upgrade* an already-painted `estimateTransit()` result asynchronously
  rather than block on it, so wiring it up later is additive.
- **UI**: empty timeline hours that fall inside a transit gap render a
  `slate-100` capsule (`Footprints`/`TrainFront` from `lucide-react`,
  "약 N분 소요") instead of the "— empty" placeholder; an hour actively
  being dragged over for a drop still shows the drop-target state first.
- Verified in-browser: scheduling 5 Fukuoka/Yufuin trend spots two hours
  apart produced 4 transit blocks whose durations matched hand-computed
  Haversine distances exactly (e.g. a 13.4km Hakata→Dazaifu leg → "약 35분
  소요"), with no console errors beyond the sandbox's expected
  no-`AUTH_SECRET` auth noise.

### Drawer-based routing split (Phase 7)

The single `/travel-scheduler` route was split into three top-level
screens under a shared App Bar, so each can grow independently instead of
competing for space on one page:

- **Route group** `src/app/(app)/` — `(app)` doesn't appear in the URL, so
  this only wraps `/discover`, `/planner`, `/planner/[shareToken]`, and
  `/scrapbook` with the new App Bar (`src/app/(app)/layout.tsx`). The
  original `/` demo and `/share/[id]` read-only page are outside this
  group and untouched.
- **`/planner`** is the full board that used to live at `/travel-scheduler`
  — moved wholesale to `src/app/(app)/planner/` (`TravelSchedulerBoard` was
  renamed `PlannerBoard`; `/api/travel-scheduler/trends` became
  `/api/planner/trends`). `/discover` (see below) and `/scrapbook`
  (`src/app/(app)/scrapbook/page.tsx`, still a "My Scrapbook (공사중)"
  placeholder) round out the three screens.
- **`src/components/AppBar.tsx`**: a hamburger button opens a left-side
  shadcn `Sheet` listing all three screens (탐색/Search icon, 계획/Calendar
  icon, 보관함/Book icon) with the active one highlighted via
  `usePathname()`. The center title and the right-side invite button are
  both route-aware: `/planner` shows the date (+ "· Shared" when on the
  `[shareToken]` sub-route) and the trip title, with the invite button
  wired to the same save-and-copy-link `handleInvite` flow the board used
  to own directly; `/discover` and `/scrapbook` show their own page name
  and hide the invite button, since there's nothing yet to invite anyone
  to on either.
- **Space optimization**: `PlannerBoard` no longer renders itself inside a
  fixed 390×844 phone-frame mockup centered on a gray page — it now fills
  whatever height `(app)/layout.tsx`'s `<main>` gives it (full viewport
  minus the 56px App Bar), split into the map (`h-[57%]`) and a
  `flex-1` timeline that scrolls independently. The old per-page header
  (title, date, invite/Clear buttons) is gone now that the App Bar owns
  the title and invite button; the `Clear` schedule button moved next to
  the search input at the top of the map instead (a small icon button —
  there was no longer a good spot for it in the timeline's header row now
  that the App Bar owns that space).
- Verified in-browser: navigating 계획→탐색→보관함→계획 via the hamburger
  Sheet works with no full page reload and correct active-item
  highlighting; re-tested the full `/planner` flow (trend-sheet
  scheduling, transit blocks, route optimization, the relocated Clear
  button, and the App-Bar invite button's login gate) against the new
  layout with no console errors beyond the sandbox's expected
  no-`AUTH_SECRET` auth noise.

### Platform schema expansion (Phase 8)

Groundwork for community features (discover feed, forking, reviews) —
`Itinerary` extended, `Review` and `TransitRoute` added as new tables. No
route reads or writes the new fields yet; this is schema only.

- **`prisma/schema.prisma`** is the canonical, hand-authored schema (`npx
  prisma db push`/`prisma generate` still can't run here — attempted a
  third time for this phase, same `ECONNRESET` on the `@prisma/engines`
  postinstall as every previous attempt). It's written to be a drop-in
  match for the existing `pg`-managed tables: `@@map`/`@map` point every
  model at `schema.sql`'s exact table/column names, and ids are
  `Int @default(autoincrement())` (matching the existing `SERIAL` columns)
  rather than the `String @default(cuid())` a fresh Prisma project would
  normally scaffold — so a future switch from `pg` to `@prisma/client`
  (already called an "isolated change" above) stays a driver swap, not a
  data migration.
- **`Itinerary`** gained `isPublic` (for the `/discover` feed),
  `forkedFromId` (self-relation, `ON DELETE SET NULL` — deleting an
  original doesn't cascade-delete everyone's forks), `likesCount`, and
  `forksCount`, all defaulted so existing rows and existing `INSERT`
  statements are unaffected.
- **`Review`**: one row per visit-verified review. `placeId` is an
  external id (Google Place ID etc.), matching how `Itinerary.placesData`
  already references places — there's still no normalized `places` table.
- **`TransitRoute`**: a cache table keyed on
  `(fromPlaceId, toPlaceId, transitMode)` so a repeated lookup — whether
  from `src/lib/transit.ts`'s Haversine fallback or a real Google Distance
  Matrix call once wired in — doesn't re-pay the computation/API cost.
- **Actually verified, not just documented**: this sandbox turned out to
  have a local PostgreSQL 16 install (unused, not part of the deployed
  app — no `DATABASE_URL` is configured for it outside this one
  verification session). Started it, pointed a throwaway `.env.local`
  (gitignored, not committed) at it, and ran the real
  `src/server/db/schema.sql` migration end-to-end: confirmed every new
  table/column/constraint via `psql \d`, confirmed the migration is safe
  to re-run against an *already-migrated* database (seeded a row on the
  pre-Phase-8 schema, re-ran the new `schema.sql`, and confirmed the row
  survived with the new columns correctly defaulted via the added
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements), and exercised the
  actual API routes against it end-to-end with a real session cookie —
  `POST /api/itineraries` → `GET /api/itineraries` → `GET
  /api/itineraries/shared/[shareToken]` — all returning correct data
  against the live, Phase-8-migrated schema.
- **`src/lib/types.ts`** gained `Itinerary`, `Review`, and `TransitRoute`
  interfaces mirroring the new schema, for future community-feature code
  to build against — checked for naming collisions against the rest of
  `src/` first (none). `tsc --noEmit`, `eslint`, and `next build` all stay
  clean.

### /discover design merge

The design team's `/discover` mockup (search bar, 국내/해외 segmented toggle,
Trending Now / All-Time Favorites / Recommended Routes sections, all backed
by dummy data) was merged into `src/app/(app)/discover/page.tsx` as-is,
with one deliberate omission: its own `<header className="sticky top-0
...">` was **not** brought over, since `src/components/AppBar.tsx`
(Phase 7) already renders one global header above every screen in this
group — copying the mockup's header too would have stacked two headers.
Instead, `AppBar.tsx`'s `PAGE_TITLES` map got one line added so the App
Bar's center title reads "어디로 떠나시나요?" specifically on `/discover`
(every other route-specific title, e.g. `/planner`'s trip name, was
already driven the same way). The `[+]` buttons on spot cards and each
route template's `[+ 내 일정에 담기]` button are wired to a shared
`handleAdd` that shows a temporary toast — "일정에 추가되었습니다! (실제
연동은 곧 업데이트됩니다)" — until a real add-to-itinerary flow exists.
Verified in a real browser: exactly one `<header>` renders on `/discover`
(and still exactly one on `/planner` after navigating there), the 국내/해외
toggle switches datasets with the animated pill, and both toast triggers
fire correctly.
