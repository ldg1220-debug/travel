# Travel Scheduler

Mobile-first trip platform with three screens under one App Bar —
**`/discover`** (browse), **`/planner`** (map + drag-and-drop daily
timeline), **`/scrapbook`** (saved trips) — plus a **`/`** home dashboard
that fans out into all three.

## Stack

- Next.js (App Router) + TailwindCSS
- Zustand — itinerary state (`src/store/itineraryStore.ts`)
- React Query — trending-places & shared-itinerary polling (`src/lib/api.ts`)
- `@react-google-maps/api` — `/planner`'s live map
  (`src/app/(app)/planner/MapProvider.tsx`)
- shadcn/ui (hand-authored, see below) + `framer-motion` for the
  `/discover`/`/scrapbook`/home screens

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 — this is now the home dashboard, linking out to
`/discover`, `/planner`, and `/scrapbook`. Without
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` set, `/planner`'s map area shows a clean
"Failed to load Google Maps" state, but every other interaction (scheduling,
search, trend sheet, budget, route optimization) still works end to end.
Copy `.env.example` to `.env.local` and set the relevant keys:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` → real Google Maps in `/planner`
- `GOOGLE_PLACES_API_KEY` → real results for the legacy `/api/trends` +
  `/api/places/search` pipeline endpoints (see below) instead of offline
  fixtures — no current screen calls these directly, `/planner`'s own
  search/trend sheet use separate, screen-local implementations instead
  (see the Phase 4 section further down)

## Interactions (`/planner`)

- **Tap** a pin → time/date picker modal → **Register Schedule**.
- **Press and hold** a pin (~0.5s) → the pin lifts → drag it onto an hour
  slot in the timeline to schedule it there.
- **✨ Trending spots** button opens a bottom sheet with curated spots plus
  a search box; tapping a result opens the same time-picker modal.

## Trend data pipeline

This was the international trend source for the very first version of this
app (a single `/` page, since replaced by the `/discover`+`/planner`+
`/scrapbook` platform below — see the "Drawer-based routing split" and
"design merge" sections for how that happened). The pipeline itself, and
the `/api/trends` + `/api/places/search` routes it backs, are kept as-is:
still fully runnable, just not currently called by any screen's UI.

`src/server/pipeline/` implements the zero-cost trend data flow described in
the spec: mock SNS scrape → regex ad-filter (drops `협찬`/`소정의 원고료`/
`디너의여왕`, keeps `내돈내산`/`영수증 리뷰`) → LLM authenticity check →
Google Places (New) `searchText` resolution with a minimal field mask → JSON
DB write. Run it with:

```bash
npm run pipeline
```

This writes `data/trending-places.json`, which `src/lib/server/getTrendingPlaces.ts`
serves via `/api/trends`, so the app never calls a paid Places API on a
user request — only the offline pipeline run does. Without
`GOOGLE_PLACES_API_KEY` / `LLM_API_KEY` set, the pipeline
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
already driven the same way). The `[+]` buttons were initially wired to a
placeholder toast only — see Phase 9 below for the real store wiring.
Verified in a real browser: exactly one `<header>` renders on `/discover`
(and still exactly one on `/planner` after navigating there), and the
국내/해외 toggle switches datasets with the animated pill.

### /discover ↔ Zustand wiring (Phase 9)

`/discover`'s cards now actually add to the itinerary instead of just
toasting a placeholder:

- **`addPlace`/`addRouteBundle`** (`src/store/itineraryStore.ts`) are new
  actions built on top of the existing `addPlaces`/`addItem` — neither
  duplicates their logic, they just call them. `addPlace` merges one
  place into the map catalog (`places`) and schedules it in `activeDate`'s
  next free hour (there's no time-picker modal on this page to ask the
  user which hour they want, unlike `/planner`'s own flow).
  `addRouteBundle` does the same for an ordered list of places, walking
  the free hours forward one at a time so a route's stop order is
  preserved in the resulting schedule.
- Every dummy `Spot` and `RouteStop` in `/discover/page.tsx` gained real
  `lat`/`lng` (plus a solid accent `color` for spots) so the "[+]"
  buttons can build genuine `Place` objects — `spotToPlace`/
  `routeStopToPlace` do that conversion, including mapping this page's
  decorative lucide icon components onto the store's `PlaceIcon` string
  enum. This was necessary for *every* card, not just the one below, since
  `addPlace`/`addRouteBundle` require real coordinates.
- **"후쿠오카-유후인 핵심 동선"** replaced the old "후쿠오카 감성 투어" dummy
  route: Tenjin Airbnb (숙소) → Clio Court (클리오 코트) → Yufuin Floral
  Village → Yufuin Ryokan. The Yufuin stops reuse this project's existing
  Fukuoka/Yufuin seed coordinates (`src/lib/mockPlacesFukuokaYufuin.ts`)
  for consistency; Tenjin/Clio Court got plausible real-world coordinates
  in the same two clusters.
- A spot's `[+]` calls `addPlace` and toasts "일정에 추가되었습니다."; a
  route's `[+ 내 일정에 담기]` calls `addRouteBundle` with all of its stops
  and then `router.push("/planner")` (`next/navigation`) — `addRouteBundle`
  is a synchronous Zustand update, so the schedule is already populated by
  the time the navigation lands.
- Verified in a real browser: clicking the Fukuoka/Yufuin route's button
  navigated to `/planner` with all 4 stops rendered on the timeline in
  order (#1–#4, 09:00–12:00, auto-assigned into consecutive free hours),
  and a spot's `[+]` button added it without navigating away, showing
  exactly the requested toast text. `tsc --noEmit`, `eslint`, and
  `next build` all stay clean.

### /scrapbook design merge

The design team's `/scrapbook` mockup — a creator dashboard (총 여행 횟수/
받은 좋아요/퍼감 stat cards), a `layoutId`-animated 3-tab segmented control
(다녀온 여행/다가오는 일정/임시 저장), and album-style trip cards with a
공개/비공개 `Switch` — was merged into `src/app/(app)/scrapbook/page.tsx`
the same way `/discover`'s was: its own `<header>` was dropped (AppBar
already renders one), and `AppBar.tsx`'s `PAGE_TITLES` map gained
`"/scrapbook": "내 추억 보관함"`.
- **`src/components/ui/switch.tsx`** is a new hand-authored shadcn
  component (same pattern as the existing `button`/`input`/`badge`/`sheet`)
  — unlike those, this one needed a real dependency,
  `@radix-ui/react-switch`, which installed cleanly (it's a pure-JS
  package with no native/binary install step, unlike Prisma's engines or
  the shadcn CLI's registry fetch — both of those are blocked here for
  unrelated reasons, not because npm itself is unreachable).
- Every stat card, tab, and trip card in this merge is still dummy data —
  the design team's mock trip list (including a "후쿠오카·유후인 힐링
  투어" card, unrelated to `/discover`'s route-bundle flow) — since no
  task yet asked to wire the dashboard numbers or the Switch's
  공개/비공개 toggle to real Zustand/DB state; the Switch's
  `checked`/`onCheckedChange` only flips local `trips` state for now.
- Verified in a real browser: exactly one `<header>` renders on
  `/scrapbook` (and still exactly one elsewhere after navigating away via
  the hamburger menu), the Switch toggles between checked/unchecked with
  the matching 공개/비공개 badge and label updating in lockstep, and the
  tab pill slides correctly between "다녀온 여행" and the empty-state tabs.

### Home dashboard at `/`

`/` moved from a standalone page to `src/app/(app)/page.tsx` — inside the
same route group as `/discover`/`/planner`/`/scrapbook`, so it gets the
global App Bar (title: "홈") instead of owning its own header. It's a
greeting ("안녕하세요, Yuna님 👋"), three big quick-access cards linking to
each of the three screens, and a one-card "Trending Now" preview linking
to `/discover`.

Originally this repo's `/` was the very first version of this app (a
single-page Kyoto demo with its own region toggle, `GoogleMapEngine`/
`KakaoMapEngine`, dnd-kit scheduling, etc.) — fully superseded by
`/discover`+`/planner`+`/scrapbook` several phases ago, but the file itself
was never removed. Replacing it with the dashboard finally made the old
component tree (`TravelSchedulerApp`, `TravelSchedulerAppLoader`,
`RegionTabs`, `TimeModal`, `TimelineView`, `TrendBottomSheet`, `MarkerPin`,
`PlaceMarker`, `src/components/map/*`, `useKakaoMapsLoader`) fully
unreachable — confirmed via a full-repo grep that nothing else imported any
of it — so all of it was deleted rather than left as dead code. The
`GOOGLE_PLACES_API_KEY`-backed trend pipeline, `/api/trends`,
`/api/places/search`, and `/share/[id]` were untouched (still real,
independently working features — see their sections above/below), even
though nothing currently calls the first two from the UI.

No `/` → `/discover` redirect was added (briefly considered, since the
task description asked for one, but that would make the new dashboard
completely unreachable — confirmed with the user that the dashboard should
win). Verified in a real browser: all three quick-access cards and the
Trending Now preview card navigate to the right screen, exactly one
`<header>` renders on `/`, and the hamburger Sheet still opens correctly
from it. `tsc --noEmit`, `eslint`, and `next build` all stay clean.

### Shared Google + Kakao map infra

A new, reusable multi-provider map foundation — not wired into `/planner`
(which keeps its own existing, working, Google-only
`src/app/(app)/planner/MapProvider.tsx` untouched) but available for
`/discover`/`/scrapbook` or any future screen that wants a real map:

- **`src/lib/maps/google-map.ts`** / **`kakao-map.ts`**: each SDK's loading
  config as plain functions/constants — the API key, the script URL
  builder, and a readiness check (`google-map.ts`), plus Kakao's extra
  `kakao.maps.load(callback)` step that `autoload=false` requires
  (`kakao-map.ts`, which also declares the minimal `Window.kakao` type
  this app actually calls — Kakao ships no official TypeScript types).
  Split out of the component below because `next/script` is JSX and can't
  live in a plain `.ts` file.
- **`src/components/map/MapProvider.tsx`**: loads **exactly one** SDK via
  `next/script` — never both — resolved from an explicit `provider` prop
  or, if omitted, from a `region` prop using the same
  international→Google / domestic→Kakao convention
  `src/store/itineraryStore.ts`'s `region` field already uses elsewhere.
  Exposes `{ isLoaded, loadError, isConfigured }` via `useMapStatus()` —
  `isConfigured` is a distinct false state (missing env var) from "still
  loading," so a consumer isn't stuck guessing why nothing rendered.
- **`src/components/map/TestMap.tsx`** + **`/dev/map-test`** (not linked
  from any nav — a direct-URL-only QA harness): mounts a real
  `google.maps.Map`/`kakao.maps.Map` once the SDK is ready, or a clear
  status placeholder otherwise.
- **`/api/places/search/route.ts`** already branched between Google
  Places (New) `searchText` and Kakao Local keyword search by `region`,
  with an offline fallback for each when the relevant key isn't set — this
  was built back in the v2 국내/해외 phase and needed no changes here.
- `.env.example` gained `NEXT_PUBLIC_KAKAO_MAP_KEY` (was entirely
  undocumented before, even though the search route's
  `KAKAO_REST_API_KEY` — a *different* Kakao key type — already was).
- Verified two ways, since this sandbox has neither real key configured:
  (1) with no keys, `/dev/map-test` shows a clear "env var not set" state
  for both providers and — confirmed via inspecting the DOM — **no**
  `<script>` tag gets injected for either SDK (no wasted network request
  for a provider that isn't configured); (2) with dummy keys set and the
  real `maps.googleapis.com`/`dapi.kakao.com` script requests intercepted
  and replaced with a stub that fills in minimal fake `google.maps`/
  `kakao.maps` globals, confirmed the *whole* real code path — script
  injection with the correctly-built URL, `onLoad` firing, `isLoaded`
  flipping true, the canvas mounting, and `new google.maps.Map(...)` /
  `new kakao.maps.Map(...)` actually getting called with the container
  element — all the way through for both providers and both the explicit-
  `provider` and derived-from-`region` code paths.

### Search API QA harness (`/dev/search-test`) — retired, see below

A direct-URL-only page (no nav link) to manually confirm
`/api/places/search` returns usable data from both branches. **Deleted**
once `/planner`'s 관심 장소 tab got its own real search UI calling this
same route (see "Search consolidated into `/planner`" further down) —
kept here as a record of what it verified:

- One region toggle (국내/해외), one text input, one 검색 button — calls
  `GET /api/places/search?region=...&q=...` on click or Enter.
- Every response is both `console.log`'d in full and rendered on screen as
  a card per place (name, address, category, coordinates), so mismatches
  between what the API actually returns and what's displayed are easy to
  spot.
- Added the previously-missing `address` field end-to-end: `Place` gained
  an optional `address?: string` (`src/lib/types.ts`), Google's field mask
  now includes `places.formattedAddress`, and Kakao's mapper now reads
  `road_address_name || address_name`. Cards fall back to "주소 정보
  없음" when a result has no address — the expected case for the offline
  fallback lists (`DOMESTIC_PLACES`/trending mocks), which never had
  address data to begin with.
- Verified against the offline-fallback path for both regions (this
  sandbox has neither `KAKAO_REST_API_KEY` nor `GOOGLE_PLACES_API_KEY`
  set): searching "Coffee" under 국내 returns the expected
  `filterByName(DOMESTIC_PLACES, ...)` match, searching under 해외 returns
  matches from `filterByName(getTrendingPlaces(), ...)` — both logged to
  console and rendered as cards. Testing the real Google/Kakao API-call
  branches requires the actual keys, only available in the Vercel
  production environment.

### Category filtering on `/api/places/search`

International (Google) search now accepts a `category` param —
`"all" | "attraction" | "lodging" | "restaurant"` — mapped to Google
Places `includedTypes` (`restaurant` → `["restaurant", "cafe"]`,
`attraction` → `["tourist_attraction", "park"]`, `lodging` →
`["lodging"]`). `maxResultCount` is fixed at 10.

### 관심 장소 (saved places) tab on `/planner`

`/planner`'s lower panel now has a two-way tab switch — 일정 (unchanged
timeline) and 관심 장소 (new) — instead of always showing the timeline:

- **`src/store/itineraryStore.ts`**: new `savedPlaces: Place[]` slice,
  distinct from the existing `places` map catalog, with
  `addSavedPlace`/`removeSavedPlace` actions. Persisted to `localStorage`
  via `zustand/middleware`'s `persist` (`partialize`d to just
  `savedPlaces`, so it doesn't interfere with the shared-itinerary polling
  sync that already owns `items`/`region`).
- **`PlannerBoard.tsx`**: the 일정 tab's map/timeline behavior is
  byte-for-byte unchanged (same `places` catalog, same drag-to-schedule
  interaction) — the 관심 장소 tab swaps in a `PlacesSearchInput` wired to
  `addSavedPlace` instead of the catalog, plus a saved-places list (tap a
  row to pan/zoom the map there via a new `mapRef`; tap a saved marker on
  the map for an `InfoWindow` with name + category). No new map library —
  reuses the existing `@react-google-maps/api`-based `MapProvider.tsx`
  exactly as before.
- Tab pill styling ports the `/scrapbook` segmented-control pattern
  (`framer-motion layoutId` sliding highlight) for visual consistency.
- Verified in the browser: tab switch renders and toggles correctly, the
  관심 장소 tab's empty state and search box show as expected, and
  switching back to 일정 restores the original map/timeline exactly. Full
  search-select → save → marker/InfoWindow round-trip needs a real
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, not available in this sandbox — only
  testable on the Vercel deployment.

### "딥 다이브" place detail overlay

A bottom-sheet overlay (`PlaceDetailOverlay.tsx`) for viewing/editing a
place without leaving whatever the planner was showing underneath:

- **Content**: a mini `<GoogleMap>` centered on the place (reuses the same
  loaded SDK as the main planner map via `useGoogleMapsStatus()` — no
  second script load), plus an edit form (category chip-select, a free-text
  memo textarea) and a "저장하기" button.
- **Trigger points**, all on the 관심 장소 tab: selecting a search result
  (`PlacesSearchInput`'s `onSelect`) now opens the overlay pre-filled
  instead of saving immediately; tapping a saved-place list row opens it
  in edit mode (existing category/memo pre-filled); tapping a `TrendSheet`
  card — now rendered on both tabs, not just 일정 — also opens it. The
  일정 tab's map-pin tap → schedule-time modal is untouched (`onUp`
  branches on the current `tab`, and map pins are still only rendered on
  the 일정 tab).
- **State model**: `Place` gained an optional `memo?: string` field.
  `itineraryStore` gained `upsertSavedPlace` (add-or-overwrite by id),
  used by the overlay's save button for both brand-new and already-saved
  places. The form's local `category`/`memo` state is keyed on `place.id`
  (remount-to-reset) rather than synced via a `useEffect`, to satisfy the
  React Compiler's `set-state-in-effect` rule.
- **State preservation**: the overlay is pure UI layered on top via
  `AnimatePresence` — opening/closing it never touches `tab`, `activeDate`,
  or any schedule state, so the 일정 tab is always exactly as it was left.
- Verified end-to-end in the browser (offline, using the mock
  `/api/planner/trends` data since no real map key exists in this
  sandbox): opened a trend card's detail overlay, set a category and a
  memo, saved — the overlay closed, the saved-place list showed the new
  entry with its memo, and switching back to 일정 showed the timeline
  completely unaffected.

### Search consolidated into `/planner`, `/dev/search-test` retired

- **`/api/places/search`'s category fall-back**: when a
  category-filtered Google search comes back with zero results,
  `searchInternational` now retries once with `includedTypes` dropped
  before giving up — a narrow/misclassified query (e.g. a specific
  restaurant name under the "관광명소" filter) can legitimately return
  nothing from Google's exact-match `includedTypes` allowlist even though
  the place itself exists. `"전체"` (category `"all"`) already sent no
  `includedTypes` at all (it was never a key in `CATEGORY_TYPE_MAP`), so
  that part of the ask was already correct going in.
- **`PlaceSearchPanel.tsx`** (new): the 관심 장소 tab's search box is no
  longer the Google Autocomplete-SDK-based `PlacesSearchInput` (still used
  as-is by the 일정 tab's map-discovery search, untouched) — it's a
  region + category picker, a text input, and a real
  `GET /api/places/search` call rendering results as a tappable card
  list. Tapping a card opens the same `PlaceDetailOverlay` used
  everywhere else in this tab (search selection, saved-list rows, trend
  cards), so search → review/edit → save is one consistent flow.
- **`/dev/search-test` deleted** — its job (prove the search route works)
  is now provable directly in the real product surface.
- Verified in the browser end-to-end on the offline (no real API key in
  this sandbox) Kakao fall-back path: searched "Coffee" under 국내 in the
  관심 장소 tab, got a result card, tapped it, the detail overlay opened,
  saved, and the place appeared in the saved-places list. The
  Google-branch category fall-back itself needs a real
  `GOOGLE_PLACES_API_KEY` to exercise — only testable on Vercel.

### Search query expansion, /discover handoff, empty seed, scheduling from the overlay

- **`/api/places/search`'s category filter, layered further**: a
  category-filtered international search now tries three passes before
  giving up — (1) query text expanded with the category's Korean label +
  `includedTypes` (e.g. `"오사카"` → `"오사카 관광명소"`, helps when the
  plain query is just a region/place name), (2) the original query text +
  `includedTypes`, (3) the original query with no filter at all. `"전체"`
  already sent no `includedTypes` (never a key in `CATEGORY_TYPE_MAP`).
- **`itineraryStore`'s `places` seed is now `[]`** instead of the
  hardcoded `FUKUOKA_YUFUIN_PLACES` — `src/lib/mockPlacesFukuokaYufuin.ts`
  deleted along with it (its only consumer). The map starts empty and
  fills in from real actions (search, trend cards, /discover) instead of
  pretending a fixed seed is organic content.
- **`PlaceDetailOverlay`'s mini map** now also does an explicit
  `onLoad={(map) => { map.panTo(...); map.setZoom(15) }}` alongside its
  `center`/`zoom` props (belt-and-suspenders — the props alone should
  already be correct on every mount since the map is keyed by
  `place.id`, but this guarantees it regardless of the underlying
  library's prop-diffing behavior).
- **"관심 장소 → 일정" scheduling**: the overlay gained a second "일정에
  추가" button (`onSchedule` prop) alongside "저장하기" — schedules the
  place at the next free hour on `activeDate` and switches to the 일정
  tab so the result is immediately visible, using the same
  next-free-slot rule as the store's `addPlace`.
- **Global pan-to-place**: every trigger that opens the detail overlay
  (관심 장소 search selection, saved-list row, trend card tap, the
  /discover handoff below) now routes through one `openDetailFor` helper
  that also pans/zooms the main planner map, not just whichever trigger
  happened to call `panToSavedPlace` before.
- **`/discover` → `/planner?openDetail={placeId}` handoff**: per an
  explicit decision to keep map-loading logic in exactly one place,
  `/discover` doesn't get its own `MapProvider`. Tapping a trending-spot
  card (not its `[+]` quick-add button, which keeps its existing
  immediate-schedule behavior) pushes the spot into the store's `places`
  catalog and navigates to `/planner?openDetail=<id>`; `PlannerBoard`
  reads that param via `useSearchParams()` (wrapped in `<Suspense>`,
  required for that hook under a statically-rendered page), looks the
  place up by id, switches to the 관심 장소 tab, and opens the overlay —
  then clears the param via `window.history.replaceState` (found during
  testing that `router.replace()` doesn't actually update the visible URL
  for a search-param-only change to the current route; plain
  `history.replaceState` does, and is also the more honest tool here
  since this is a display-only cleanup, not a real content navigation).
- Also deleted `verify-phase5.ts`, a one-off root-level audit script left
  over from an earlier phase — it imported the now-deleted
  `FUKUOKA_YUFUIN_PLACES` and was breaking `tsc --noEmit` for the whole
  project.
- Verified in the browser end-to-end: tapping a `/discover` trending card
  navigates to `/planner`, auto-opens the 관심 장소 tab with the detail
  overlay already showing that place (mini map, category chips, memo,
  both action buttons); tapping "일정에 추가" closes the overlay, switches
  to 일정, and the place appears on today's timeline; the URL cleanly
  drops back to plain `/planner` with no lingering query param.

### Six-issue Planner/Discover overhaul (reimplemented from a reference PR)

A parallel session (PR #2, `claude/plan-tab-ux-improvements-3weni2`) had
already built and headless-browser-verified these 6 fixes against an
earlier, divergent branch — this reimplements the same logic/UX directly
on top of everything above (savedPlaces, `PlaceDetailOverlay`,
`PlaceSearchPanel`, the `/discover` handoff), rather than merging that
branch's diff wholesale.

**Planner:**
- **Smart map zoom**: `fitBounds`/`panTo` now re-fit on every visible-
  marker-set change (search, trend sheet, scheduling, *or switching
  tabs* — the 일정/관심 장소 tabs show different marker sets, an
  extension beyond the reference PR since it had no tabs to begin with).
- **`TIMELINE_HOURS` is now 00–23** (was a fixed 09:00–21:00 window), and
  the single-day list is now a **3-day grid** (`VISIBLE_DAYS`,
  `dateWindow`, `shiftISODate`, `formatDateLabelShort` in
  `src/lib/timeline.ts`), with ‹ › day-window navigation.
- **`ScheduleModal` + `MonthCalendar`** (new, `src/components/`, shared
  with Discover): a real month-grid date picker plus an hour/minute
  picker, replacing the old inline "next free hour" auto-fill. Every
  entry point that lands a place on the itinerary — a map-pin tap, a
  trend-card tap, the 관심 장소 tab's "일정에 추가" — now opens this
  modal instead of silently scheduling. Clicking an already-scheduled
  stop reopens it pre-filled, in edit mode, with a delete button.
- **Drag-and-drop rescheduling**: `@dnd-kit/core` (`DndContext`,
  `useDraggable`/`useDroppable`) added for dragging an *already-scheduled*
  stop to a different hour/day cell, swapping with the occupant if one's
  there (`itineraryStore`'s new `moveItem` action). The *map-marker → new
  slot* drag (an unscheduled pin onto the grid) still uses the existing
  custom pointer long-press system — two separate drag mechanisms
  coexisting, same as the reference PR.
- `addPlace`/`addRouteBundle` (the old silent-auto-schedule actions)
  removed from the store — every call site now goes through
  `ScheduleModal` instead.

**Discover:**
- **`/api/discover/trends`** (new) + **`src/lib/discoverData.ts`** (new):
  real API-backed browse data branching on `scope` (국내/해외) instead of
  an object baked into the page, plus `category=season|hot|region` and
  free-text `q=` search (routes ranked by likes, spots grouped by
  category tag).
- **Category chips** (전체/계절별/최근 핫한/지역별) with a region sub-chip
  row, and a **working search box** (Enter or the 검색 button) showing
  popular routes + a category-grouped place list instead of the browse
  bundle.
- **No more silent auto-add**: both the spot `[+]` button and a route's
  "전체 일정에 담기" now open `ScheduleModal`/a date-only `RouteDateModal`
  instead of instantly scheduling.
- Card-body-click (not the `[+]` button) still hands off to `/planner`'s
  딥 다이브 overlay via `?openDetail=`, from the previous round — kept
  as-is alongside the new `[+]`-opens-`ScheduleModal` behavior.

Verified in the browser end-to-end: category chips + region sub-chips,
searching "경주" → popular-routes-by-likes + category-grouped spots, a
search result's `[+]` opening `ScheduleModal` (month calendar → time grid
→ register), a `/discover` card's body-click still auto-opening the
관심 장소 tab's detail overlay on `/planner`, the 3-day × 00:00–23:00
grid rendering with day-nav, a trend-card tap opening `ScheduleModal`
(create), registering it, and clicking the resulting scheduled card
reopening the same modal in edit mode (pre-filled, with delete). Full
drag-and-drop reordering across grid cells wasn't separately end-to-end
simulated (dnd-kit's pointer-sensor drag is awkward to script reliably)
but builds clean and the click/create/edit paths through the same
`moveItem` action are confirmed.

### Service-level polish: region hierarchy, route preview, proximity suggestions, resizable blocks

Five follow-up improvements aimed at making the app read like a real
travel product rather than a framework demo.

**Discover — 3-level region hierarchy + coming-soon fallback:**
- `regionHierarchy()`/`matchesRegionPath()` (`src/lib/discoverData.ts`)
  derive a 대륙→국가→도시 tree (overseas) / 시도→동네 tree (domestic)
  purely by parsing the `region: "국가 · 도시"` string every mock spot
  already had, plus a small `COUNTRY_CONTINENT` lookup for the continent
  level — no new fields added to the ~20 existing spot objects.
- `/api/discover/trends` accepts `path=<label>,<label>,...` (most-general
  first) and filters `trending`/`favorites` down the tree. A fully
  drilled-down leaf with nothing in it no longer dead-ends: the response
  sets `notice: "coming_soon"` and swaps in the scope's overall
  top-saved spots instead of an empty screen, surfaced as an amber
  banner on `/discover`.
- The page renders breadcrumb + drill-down chips from the API's
  `regionTree`, replacing the old flat region-chip row.

**Discover — route preview modal:**
- Clicking a route card's body (not its "담기" pill, which still
  schedules directly via `stopPropagation`) opens `RoutePreviewModal`: a
  full stop list plus a real `GoogleMap` with a numbered `Polyline`
  tracing the route.
- `MapProvider` (previously planner-only, by explicit prior decision) is
  now also mounted on `/discover`, but only conditionally — wrapping
  just the preview modal's contents, so Google Maps still isn't loaded
  on a plain `/discover` visit, only once a preview is actually opened.

**Discover — "전체보기" wired up:**
- Trending/Favorites/Routes sections cap themselves at 4/4/2 items with
  a "전체보기" button once there's more; clicking it swaps in
  `ExpandedSection`, the full unsliced list with a back button, instead
  of doing nothing.

**Planner — proximity-based nearby suggestions:**
- `TrendSheet` now accepts the day's already-scheduled stop coordinates
  as `nearAnchors` and sorts its cards nearest-first by Haversine
  distance (`src/lib/geo.ts`) to the closest one, annotating each card
  with its distance. With no stops scheduled yet, every distance is
  `null` and the sort is a no-op — the original curated order holds.
  Reuses the existing long-press-drag-to-grid mechanic rather than
  building new drag machinery, since that path already worked.

**Planner — flexible timeline blocks + resize:**
- `ItineraryItem` gained `durationMinutes` (defaults to 60 for new
  stops). The store's `isHourTaken`/`addItem`/`moveItem` moved from
  exact-hour matching to interval-overlap checks
  (`rangesOverlap`/`minutesFromTime` in `src/lib/timeline.ts`), and a new
  `resizeItem(id, durationMinutes)` action clamps to
  `[MIN_DURATION_MINUTES, day-end]`.
- The day-column grid no longer renders one card per hour cell — the
  background grid (drop targets, transit chips, empty-state) stays
  hour-by-hour, but scheduled stops are now absolute-positioned,
  variable-height cards (`top`/`height` derived from start-minute and
  duration) layered on top.
- Each card has a bottom-edge drag handle (plain pointer events, not
  dnd-kit — it lives *inside* a dnd-kit-draggable card and stops
  propagation on `pointerdown` so a resize drag doesn't also start a
  card-move drag) that snaps to 15-minute steps and clamps against the
  next stop's start time (or end-of-day for the last stop).

Verified in the browser end-to-end (after temporarily installing
Playwright, screenshotting, then removing it): scheduling a stop,
resizing it by dragging its bottom handle (56px → 112px, i.e. 60min →
120min, with the "N분" label updating live), the trend sheet re-sorting
and annotating cards with distance once a stop exists, drilling two
levels into 지역별 (제주 → 애월/서귀포) with real filtered results,
"전체보기" opening the expanded-section view with a working back button,
and a route card opening the preview modal with its stop list and add
button. (The preview modal's embedded map itself shows "지도 로딩 중…"
in this sandbox — no live Google Maps key is configured here, a
pre-existing environment limitation unrelated to this change.)

### Vercel-only blank map fix

Reported symptom: maps rendered fine on `localhost` but stayed blank on
Vercel, with no console/log errors and the env vars + API key confirmed
correct — pointing at a client-rendering/layout-timing issue rather than
a config problem. Addressed all three angles raised:

- **Guaranteed client-only rendering**: the three places that mount a
  `<GoogleMap>` — the planner's main map, the 딥 다이브 detail overlay's
  mini map, and `/discover`'s route-preview polyline map — were each
  split into their own file (`PlannerGoogleMap.tsx`, `PlaceMiniMap.tsx`,
  `RoutePreviewMap.tsx`) and are now loaded via
  `next/dynamic(() => import(...), { ssr: false })` from their callers.
  This guarantees the Maps SDK/canvas is never part of the server-
  rendered or hydration-replayed HTML — it only ever mounts after the
  client has taken over and the container's real layout exists. (`Pin`/
  `MarkerContent` moved to a new `MapMarkers.tsx` so the dynamically-
  imported map file doesn't need a circular import back into
  `PlannerBoard.tsx`.)
- **Script isolation confirmed, not just assumed**: traced every import
  of the legacy dual Google/Kakao loader (`src/components/map/
  MapProvider.tsx`) and confirmed it's only ever reachable from
  `/dev/map-test` — never from `/planner` or `/discover`, which
  exclusively use the Google-only loader at `src/app/(app)/planner/
  MapProvider.tsx`. Renamed that loader's `useJsApiLoader` id from
  `"planner-google-map"` to `"travel-scheduler-google-maps"` and added
  comments on both files documenting the isolation, so it can't
  regress silently later.
- **Container sizing hardened**: added `nudgeGoogleMapResize()`
  (`src/lib/maps/mapResize.ts`) — the Maps SDK measures its container's
  size exactly once, at construction, with no built-in resize-recovery,
  so a container whose real size resolves even one frame late (a
  percentage-height flex column, a still-animating modal) can be left
  permanently at 0×0 with no error. It force-fires the SDK's own
  `resize` event plus a re-center/re-fit, via a double
  `requestAnimationFrame` with a 250ms `setTimeout` fallback, wired into
  all three map `onLoad` handlers. Also gave the planner's main map
  container (the one percentage-height one, `h-[45%]`) an explicit
  `min-h-[260px]` floor so a flex-resolution race can't collapse it to
  literal zero, and added explicit `w-full` to every map container as a
  defensive no-op.

Couldn't reproduce the Vercel-only symptom directly in this sandbox (no
live Google Maps key here — every map area shows its "Loading map…" /
"지도 로딩 중…" state instead of real tiles either way), so this targets
the three most likely root causes from the report rather than a
confirmed-fixed repro; tsc/eslint/build are clean and a browser pass
confirmed nothing regressed (TrendSheet → ScheduleModal flow, 관심 장소
tab, and the route preview modal all still open and render correctly
after the extraction).

### Search results: category filter chips + 맛집/숙소 dataset expansion

Search results ("카테고리별 장소") were previously always grouped by
every tag present, with no way to narrow down to just food or lodging —
and the domestic/overseas datasets barely had any 음식점/숙소 entries to
begin with, so cities like 경주/오사카 read as 관광지-only even though the
data model already supported richer tags.

- Added a `[전체, 관광지, 테마파크, 음식점, 술집, 숙소]` filter chip row
  directly under the "카테고리별 장소" subtitle in `SearchResults`
  (`discover/page.tsx`). Clicking a chip filters the already-fetched
  search results client-side (`spots.filter(s => s.tag === category)`)
  rather than a new API round-trip — the single `/api/discover/trends?q=`
  call already returns everything matching the query, so there's nothing
  a second request would add. The filter is local `useState`, reset via
  `key={activeQuery}` on `<SearchResults>` so a fresh search always
  starts back at 전체 instead of carrying over the previous one's pick.
- Expanded `discoverData.ts`: 경주 and 오사카 (previously 1 and 0 음식점
  entries, 0 숙소 entries each) now each have 4 음식점 (황리단길
  라멘하우스, 야키니쿠 스미비, 황남빵 본점, 교촌마을 한옥 맛집 / 도톤보리
  타코야키 왕골목, 신사이바시 야키니쿠 규카쿠, 우메다 라멘 스트리트,
  쿠로몬 시장 스시) and 4 숙소 entries (호텔/게스트하우스/에어비앤비 mix
  for both cities).
- Added a `hotel` `SpotIconKey` (mapped to lucide's `Hotel` icon, and to
  `PlaceIcon: "pin"` for the planner marker — `types.ts`'s `PlaceIcon`
  enum has no dedicated lodging icon, "pin" is the same fallback `tent`
  already used) so 숙소 cards render visually distinct from 음식점/관광지.
- The pickup flow needed no changes: `SpotCard`'s `[+]` button already
  ran through `spotToPlace()` → `ScheduleModal` for every spot regardless
  of tag, so the new 음식점/숙소 cards use the exact same "골라서 바로
  일정에 담기" path as every other search result.

Verified in the browser: searching "경주" and "오사카" each surface 4
음식점 + 4 숙소 cards once filtered, chip switching updates the card grid
live with no other category's header bleeding through, and a 숙소 card's
`[+]` button still opens `ScheduleModal` correctly. tsc/eslint/build
clean, no console errors during the pass.

### Search engine: intent-keyword parsing + token matching + 3x data volume

"경주" alone returned results, but "경주 밥집" / "경주 맛집" / "경주 숙소"
— the actually-natural way someone searches — returned "결과가 없어요",
since no place's name/region literally contains the word "밥집". Category
choice was also capped at a handful of tags with barely any 음식점/숙소
entries to find in the first place.

- **`parseSearchQuery()`** (`discoverData.ts`): recognizes a fixed set of
  intent keywords (맛집/밥집/음식점/레스토랑/술집/이자카야/숙소/호텔/
  게스트하우스/에어비앤비/카페/커피/관광지/명소/테마파크/놀이공원/박물관/
  쇼핑), strips whichever one appears from the query, and returns both the
  keyword-stripped `coreQuery` (what actually gets text-matched) and the
  `intentTag` it implies. `/api/discover/trends`'s `q=` handler now runs
  the match against `coreQuery` instead of the raw string, and returns
  `intentTag` in the response. If the query was *only* an intent keyword
  ("맛집" with no city), there's nothing left to text-match — falls back
  to every spot of that tag scope-wide instead of an empty result.
- **`SearchResults`** reads `intentTag` off the search response and
  pre-selects that filter chip (via React's "adjust state during render
  when a prop changes" pattern, not an effect — `intentTag` only becomes
  known once the async fetch resolves, after the component's already
  mounted). 전체/other chips stay fully clickable — this isn't a hard
  filter, just where the results land.
- **`spotMatches`/`routeMatches`** moved from one-contiguous-substring
  matching to tokenized AND-matching (every whitespace-separated word
  must appear somewhere in the combined name/region/tag text). This
  matters independently of the keyword-stripping: `"경주 황남동"` never
  matches `.includes()` against a region formatted `"경주 · 황남동"` — the
  literal 5-character run doesn't exist because of the `" · "` in the
  middle — but token matching handles it correctly since each word is
  checked independently.
- **Data volume**: 경주 and 오사카 each go from 2/4/4 (관광지/음식점/숙소)
  to 15/14/14. Rather than hand-typing ~70 new full entries, added a
  `generateSpots()` helper that takes a hand-authored list of real-
  sounding names (첨성대, 동궁과 월지, 규카츠 이치우마, 신사이바시
  프리미어호텔, …) and mechanically derives everything else — id, a
  small deterministic coordinate offset so pins don't stack on the seed
  coordinate, gradient/color/season cycling, a descending save-count
  ramp — from the list index. Only the names carry hand-authored effort;
  the repetitive object-literal fields don't.

Verified in the browser: "경주 밥집"/"경주 맛집" both land with 음식점
pre-selected and 14 result cards (no more false "결과가 없어요"); "경주
숙소" and "오사카 호텔" land on 숙소; a bare "맛집" with no city falls
back to all 15 domestic 음식점 with 음식점 still pre-selected; "경주
황남동" (a query that's never contiguous in the actual `"경주 ·
황남동"` region string) now matches via tokenization; a genuinely
unrelated string still shows the "결과가 없어요" empty state; and 전체
remains clickable after landing on an auto-activated chip. tsc/eslint/
build clean, no console errors during the pass.

### 탐색 탭 품질 + 서버 사이드 페이지네이션

Two combined follow-ups: (1) search relevance/volume — 음식점 needed a
sub-category, food-intent searches surfaced unrelated routes, and
regions never went beyond 아시아; (2) the search spot list was fetched
and filtered entirely client-side, which doesn't scale and doesn't match
how a real Places-API-backed endpoint would behave.

**Relevance & volume:**
- `DiscoverSpot` gained `cuisine?: CuisineTag` (일식/한식/양식·아시안/
  카페·디저트) and `subTags?: string[]` (구체적 메뉴 키워드, e.g. `["라멘",
  "돈코츠라멘"]`). `spotMatches` now checks both, so a dish-specific query
  like "오사카 라멘" matches every ramen-adjacent subTag, not just names
  containing the literal word — 6 results instead of 2.
- `parseSearchQuery` gained a `FOOD_DISH_KEYWORDS` fallback: a query with
  no explicit "맛집"/"음식점" suffix but a recognizable dish name (라멘,
  스시, 야키니쿠, …) still resolves `intentTag: "음식점"`, unlike the
  suffix keywords the dish word stays in the core query since it's also
  a real subTags match term.
- 음식점 category chip now reveals a second row of cuisine sub-chips
  (전체/일식/한식/양식·아시안/카페·디저트), filtered server-side.
- Route sorting: when the search intent is 음식점, routes with
  먹방/맛집/카페/미식 in the title or subtitle rank above everything else
  (stable secondary sort by likes) — "경주 맛집" no longer surfaces
  "경주 역사 탐방 코스" ahead of a food-relevant route.
- `COUNTRY_CONTINENT` + seed spots for 유럽 (영국·런던, 프랑스·파리) and
  미주 (미국·뉴욕, 캐나다·밴쿠버) — 지역별 previously only ever had 아시아
  to drill into. A leaf city with nothing now falls back one path segment
  at a time (city → country → scope-wide) before giving up, so "준비 중"
  recommendations stay geographically relevant.
- `generateSpots()`-produced batches (경주/오사카) now split across
  `trending`+`favorites` instead of dumping everything into `favorites` —
  narrow region/season filters were leaving "Trending Now" with 1-2 lonely
  cards; a new `padTrending()` also backfills from same-filtered
  favorites up to a 4-card minimum for *any* city/season selection, not
  just the ones with generated data.

**Server-side pagination:**
- `/api/discover/trends`'s `q=` handler now accepts `tag` (explicit
  category override — defaults to the detected `intentTag`, then "all"),
  `cuisine`, `page` (default 1), and `limit` (default 10). Category/
  cuisine filtering happens server-side *before* pagination, so a chip
  switch and a page click both only ever compute/return the current
  page's spots — never the full matched set. The response's `pagination`
  block (`page`/`limit`/`total`/`hasMore`/`nextPageToken`) mirrors the
  shape a real Places API paged response would use (`nextPageToken` is
  mocked — this app pages off `page` directly — purely so a later live
  API swap is a drop-in rather than a redesign).
- `SearchResults` moved its data-fetching in-component (previously the
  parent fetched and passed props down) so it can own category/cuisine/
  page state and react-query's `placeholderData: keepPreviousData` — that
  keepPreviousData option turned out to matter more than expected: since
  `page` is part of the query key, switching pages is technically a brand
  new query with no cache entry, so without it `data` would drop to
  `undefined` on every page click and collapse straight to the full-page
  "검색 중…" state instead of the intended card-grid-only skeleton — this
  was caught by an actual failing browser-test assertion, not just code
  review, and confirmed fixed by rerunning it.
- Numbered page buttons (windowed to a readable size past 7 pages) at the
  bottom of the "카테고리별 장소" section; clicking one shows a skeleton
  grid over just the spot cards while refetching, then swaps to the new
  page's cards — chips, routes, and the rest of the page never move.

Verified in the browser: 음식점 → 일식 sub-chip filters correctly;
"경주 맛집" ranks a 카페 route above the unrelated 역사 탐방 코스; "오사카
라멘" returns 6 results; 지역별 → 유럽 shows 영국/프랑스; a narrow
경주 → 황남동 drill-down shows exactly 4 Trending Now cards; a bare
"맛집" search (15 domestic 음식점 total) shows page 1 capped at 10 cards
with a working page-2 button that skeleton-loads then swaps to different
cards. tsc/eslint/build clean, no console errors during the pass.

### Search relevance, recent searches, map click-to-save, dynamic header, menu split

A "real service" pass across seven complaints about data thinness and
missing UX plumbing: 우메다 returning almost nothing, "근처"-style natural
queries returning zero results, no rating data on cards, no recent-search
memory, no way to scrap an arbitrary map location, a permanently hardcoded
header, and a saved-places menu conflated with the trip archive.

- **우메다 데이터 + 평점**: `DiscoverSpot` gained `rating?`/`reviewCount?`;
  every spot lacking one gets a deterministic value derived from its
  `saves` count so results stay stable across reloads. 17 new 우메다 spots
  (13 음식점 + 4 숙소) bring "우메다" alone from 2 matches to 22, and
  `SpotCard` now renders a ⭐ rating + review count line under the region.
- **로케이션 필러 단어 제거**: `parseSearchQuery` strips 근처/인근/주변/
  가까운/근방 before intent/dish-keyword detection — these words never
  appear in any spot's searchable text, so under the existing token-AND
  matcher leaving them in guaranteed zero results regardless of data
  volume. "우메다 근처 맛집" now resolves exactly like "우메다 맛집".
- **최근 검색어**: new `useRecentSearches` hook, localStorage-backed
  (`travel-discover-recent-searches`, capped at 5, newest-first, re-
  searching bumps to front instead of duplicating). The search input
  shows a dropdown of recent queries on focus (a `onMouseDown` +
  `preventDefault` on each row keeps it from disappearing before its own
  `onClick` fires from the input's blur), with a clear-all action.
- **지도 클릭 저장**: `PlannerGoogleMap`'s `<GoogleMap>` now has an
  `onClick` that distinguishes a labeled POI tap (`IconMouseEvent.placeId`
  + `.stop()` to suppress the default info window) from a bare coordinate
  click. `PlannerBoard` resolves a POI's real name via
  `PlacesService.getDetails()` (showing "불러오는 중…" while it's in
  flight, and a plain "선택한 위치" label immediately for a bare
  coordinate), then offers a "관심 장소에 저장" button in a popup that
  calls the existing `upsertSavedPlace`. A ref-based staleness check
  discards a slow `getDetails()` response if the user has already clicked
  elsewhere before it resolves.
- **상단 타이틀 동적 바인딩**: the store gained a non-persisted
  `currentCity` field (`AppBar` reads it instead of the old hardcoded
  "Fukuoka × Yufuin"), set from `/discover` at the three points a spot or
  route actually heads toward the itinerary (quick-add, opening the detail
  overlay, confirming a route). Deliberately not persisted — like the rest
  of the in-memory itinerary state, it's expected to survive normal
  in-app (`router.push`) navigation, not a hard page reload.
- **국내/해외 지도 엔진 분기**: re-verified rather than rebuilt — `/planner`
  and `/discover` have only ever mounted `PlannerGoogleMap`
  (`@react-google-maps/api`, `next/dynamic(..., { ssr: false })`); a
  parallel Kakao-engine renderer for those two routes was never part of
  their architecture (Kakao vs Google is only live side-by-side in
  `/dev/map-test`, by design from an earlier round). Building a full
  second live map renderer here isn't verifiable in this sandbox anyway
  (no `NEXT_PUBLIC_KAKAO_MAP_KEY`), so this item stayed scoped to
  confirming the existing Google-only mount for these two routes has no
  cross-engine script conflicts, documented here rather than adding
  untestable code.
- **메뉴 분리**: `NAV_ITEMS`'s 보관함 entry renamed to "다녀온 여행
  보관함"; a new "관심 장소 보관함" entry lives in its own visually
  separated section at the bottom of the Sheet nav, linking to a new
  `/saved-places` page (lists `savedPlaces` from the store, each row
  navigable back into `/planner`'s detail overlay, with a remove action
  and an empty state).
- **글로벌 시드 확장**: 15 new spots across 태국·방콕, 대만·타이베이,
  이탈리아·로마, 스페인·바르셀로나, 미국·샌프란시스코, plus
  `COUNTRY_CONTINENT` entries for 태국/대만/이탈리아/스페인 so region
  drill-down and country-level fallback both resolve correctly for them.

Verified in the browser: "우메다 근처 맛집" returns non-empty results with
음식점 auto-activated and ⭐ ratings visible; the recent-searches dropdown
appears on focus and re-running a past query works; clicking a search
result's card (real `router.push` in-app navigation) correctly changes
`/planner`'s header from "Fukuoka × Yufuin" to the searched city, with no
`Fukuoka` text left over; `/planner` still loads cleanly with the new map
click handler wired in; the Sheet nav shows both renamed/new menu entries
and 관심 장소 보관함 navigates to a working `/saved-places`; 방콕/타이베이/
로마/바르셀로나/샌프란시스코 all return non-empty search results. tsc/
eslint/build all clean, no console errors during the pass.

### /discover search wired to real Google Places / Kakao Local (not just the seed list)

The previous round's 우메다 fix expanded the *curated seed dataset* in
`discoverData.ts` — but that only ever papers over one city at a time. An
arbitrary real store (e.g. a specific 도톤보리 shop) would still return
nothing, because `/discover`'s search never queried anything beyond that
hand-authored list, no matter how large it got. Meanwhile `/planner`'s
sidebar search (`/api/places/search`) already had real Google Places Text
Search (overseas, with real ratings) and Kakao Local keyword search
(domestic) wired up — `/discover` just never called it.

- `fetchLivePlaceSearch(scope, query, tag)` (`src/lib/api.ts`) hits that
  same `/api/places/search` route from `/discover`, mapping scope → region
  and the search page's category chip → the route's existing
  `attraction`/`restaurant`/`lodging` type hint.
- `/api/places/search`'s route now tags every response with its real
  provenance — `source: "google" | "kakao" | "mock"` — since the route
  already silently fell back to cached/offline place lists in a few paths
  (no Kakao key, no Google key, or the live call itself erroring
  mid-request) and a 200 response alone doesn't mean the data is actually
  live. `fetchLivePlaceSearch` only ever surfaces `google`/`kakao`-sourced
  results — a `mock` response is treated exactly like an empty one, so a
  fallback list never gets shown under a "실시간 검색 결과 · 실제 장소"
  heading pretending to be real.
- `SearchResults` runs this as a second, independent React Query alongside
  the existing curated-spot query — a live-API failure or a missing key
  never blocks or errors out the curated section. When it does return
  results, a new "🔎 실시간 검색 결과" section renders above the curated
  grid via a new `LivePlaceCard` (real name/address, ⭐ rating when the API
  provides one — Kakao Local doesn't return ratings at all, so a domestic
  live hit shows "실제 지도 데이터" instead), wired to the same
  add-to-itinerary / detail-overlay flow as curated spots (`Place` objects
  need no extra mapping, since that's already `/api/places/search`'s
  return shape).

This sandbox has no real `GOOGLE_PLACES_API_KEY`/`KAKAO_REST_API_KEY`
configured, so the live path itself can't be exercised end-to-end here —
verified instead that both failure modes degrade correctly: overseas
without a key still 500s at the API layer exactly as before (existing
`/planner` behavior, untouched) and `fetchLivePlaceSearch` swallows that
into an empty result; domestic without a key falls back to a *different*
mock list (`DOMESTIC_PLACES`) exactly as before, and the new `source`
tagging correctly keeps that hidden from the live-results section. Neither
path threw, crashed, or showed misleading "real" data, and the existing
curated search (우메다/방콕/etc.) kept working with no regression. The
account this was built for confirmed both keys are already set in the
actual Vercel deployment, so the live path is expected to resolve
real, arbitrary store names there once this deploys.

### Live-search result caps, saved-place mini map context, planner search zoom, honest ratings

Four follow-ups from testing the previous round's live-search deploy:

- **Live-search result cap raised**: `callGoogleSearchText` was
  hard-capping every response at 8 places regardless of how many Google
  actually returned (`maxResultCount: 10` in the request, then `.slice(0,
  8)` again on the response) — bumped to the New Places API's real
  per-request ceiling of 20. Kakao Local's keyword search now explicitly
  requests `size=15` (its own max) instead of defaulting to a smaller page
  and getting sliced to 8 afterward. A popular query should come back with
  as many real results as the underlying API has, not an arbitrarily small
  slice of them.
- **Curated ratings were fabricated — now removed**: the previous round's
  ⭐ rating/review count on curated `SpotCard`s was never real Google/Naver
  data — it was a formula (`4.2 + seed*0.75`) derived from each spot's
  `saves` count, deterministic but entirely made up, and presented exactly
  like a genuine rating. That backfill and its rendering are removed from
  `discoverData.ts`/`SpotCard`; a real ⭐ rating now only ever appears on
  the "실시간 검색 결과" section's `LivePlaceCard`, where it's a genuine
  value from the live Google Places response.
- **Saved-place tap now shows surrounding context, not an isolated pin**:
  `/saved-places` → tap a place → `PlaceDetailOverlay`'s mini map
  (`PlaceMiniMap`) now also plots any *other* saved 관심 장소 within 5km as
  smaller secondary pins (via `OverlayView`, capped at 6), and widens from
  street-level (zoom 15) to neighborhood-level (zoom 13) whenever there
  are any, so the map actually shows "this place and what's around it"
  instead of a single dot with no geographic context when there's
  something nearby worth showing.
- **Planner search no longer zooms out to "country level"**: `/planner`'s
  일정 tab search (`PlacesSearchInput` → `handlePlaceDiscovered`) only
  ever added the new place to the map's marker list — the "smart zoom"
  effect watching that list then ran `fitBounds` over *every* marker,
  old and new. Searching for a place far from whatever was already on the
  map (e.g. the Fukuoka/Yufuin seed data) fit a bounding box spanning
  both, zooming out far enough to look like a country-level view instead
  of landing on the place just searched for. `handlePlaceDiscovered` now
  pans/zooms straight to the new place (zoom 15) and sets a
  `skipNextFitRef` flag so the smart-zoom effect's own `fitBounds` — which
  still runs for every other case (route-template imports, tab switches,
  multi-stop schedules) — skips just that one re-render instead of
  immediately undoing the explicit pan.

This sandbox still has no real `GOOGLE_PLACES_API_KEY`/`KAKAO_REST_API_KEY`
or `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, so none of the actual map
pan/zoom/pin-rendering behavior above could be visually verified here —
same constraint as every previous map-related round. Verified instead:
tsc/eslint/build all clean, `/planner` and `/saved-places` still load and
navigate without crashing after these changes, and curated search
(우메다/etc.) still returns results with no fake rating shown anymore.

### Leftover English strings from the app's earliest (pre-Korean) phase, localized

The user pointed out `/planner`'s header still showed "SATURDAY, JUL 4" and
an English "Search a place…" search bar — this turned out not to be a
caching/deployment issue (confirmed they were on the correct
`travel-xi-red.vercel.app/planner` production domain), but a real,
un-related-to-this-round gap: `/planner` has its own components separate
from `/discover`'s (which got fully localized across many earlier rounds),
and several of them were never touched since the project's original
English-language phase. A repo-wide sweep found and localized all of it:

- `formatDateLabel`/`formatDateLabelShort` (`lib/timeline.ts`) were
  hardcoded to `toLocaleDateString("en-US", ...)` — this is what actually
  produced "SATURDAY, JUL 4" in the AppBar and "Sat 7/4" in the day tabs.
  Switched to `ko-KR` (`7월 4일 토요일`, `7/4 (토)`), matching
  `MonthCalendar`'s existing single-character Korean weekday convention.
- `PlacesSearchInput.tsx`'s placeholder ("Search a place…"), the 일정 tab's
  "Plan" section label and day-count ("3 stops"), `TrendSheet.tsx`'s
  "Trending spots" button and "Trending in Fukuoka & Yufuin" sheet title
  (a *second*, entirely separate hardcoded-city instance this session's
  earlier "dynamic header" fix never touched, since that one only patched
  `AppBar.tsx` — now reads `currentCity` from the store too), both
  `PlannerGoogleMap`/`PlannerBoard`'s "Loading map…"/"Failed to load Google
  Maps." states, several aria-labels (Previous/Next day, Remove, Menu,
  Previous/Next month), the invite-link-copied toast, and the
  route-optimization-needs-3-stops toast.
- `/discover`'s own browse-feed section headers were mixed-language too —
  "Hottest Right Now"/"Trending Now"/"All-Time Favorites"/"Recommended
  Routes" (both the inline `SectionHeader` titles and the `SECTION_META`
  map backing the "전체보기" expanded view), a "Route stop" category
  fallback, and "Clear search"/"Close" aria-labels.

Confirmed via a repo-wide grep afterward that no more visible English
strings remain in `/planner`, `/discover`, `/saved-places`, `/scrapbook`,
or the shared `AppBar`/`MonthCalendar` components (the `/dev/*` debug
routes are intentionally left alone — internal tooling, not user-facing).
Verified in the browser: `/planner`'s header now reads "7월 4일 토요일",
day tabs read "7/4 (토)" with "0개 장소", the map loading/error states and
search placeholder are all Korean, and `/discover`'s section titles are
"지금 뜨는 장소"/"꾸준히 사랑받는 명소"/"추천 코스" with no English left.
tsc/eslint/build clean, no console errors, no regressions.

### 실시간 검색 결과: 정렬 옵션 + 실제 업체 사진 + 메뉴·리뷰 딥링크

Requested after the live search was confirmed working on production
(도톤보리 맛집 → 실제 구글 결과 20개): sort controls, real business/food
photos, and menu access.

- **정렬 칩** (관련도순/별점순/리뷰많은순) on the 실시간 검색 결과 section
  — client-side sort over the ≤20 live results; "관련도순" keeps Google's
  own ranking. `places.userRatingCount` added to the field mask so 리뷰
  count is both displayed on cards ("⭐4.7 · 리뷰 1.2k") and sortable.
- **실제 업체 사진**: `places.photos` added to the search field mask; each
  live card renders its first photo through a new keyless proxy route
  **`/api/places/photo`** — the client only ever knows the photo *resource
  name* (`places/…/photos/…`); the proxy asks Google for the short-lived
  googleusercontent URL with the server-side key (`skipHttpRedirect=true`)
  and 302s the browser there, so the API key never appears in any <img>
  URL. Strict resource-name shape validation so the route can't be used as
  an open redirect; day-long Cache-Control on the redirect. Cards without
  a photo keep the existing gradient+pin fallback (all Kakao domestic
  results, since Kakao Local returns no photos).
- **메뉴**: the Places API does **not** expose Google Maps' menu-tab data
  at all — no field for it. What it does expose is `googleMapsUri`, the
  deep link to that exact place's Google Maps page (where menu/reviews/
  full photos live). Each live card gets a "메뉴·리뷰" button and the
  place detail overlay gets a "구글맵에서 메뉴·리뷰·사진 보기" link, both
  opening that page in a new tab. Since `googleMapsUri`/`photoName`/
  `reviewCount` ride along on the `Place` object, a live result saved to
  관심 장소 keeps its menu link in the /planner detail overlay too.
- **English type badges fixed**: cards were showing raw `primaryType`
  values ("japanese_restaurant") as their category badge — added a
  Korean label map (일식/스시/라멘/야키니쿠/카페/술집/숙소/관광지, ~25
  types) with an underscore-stripping fallback for unmapped types.

Verified: tsc/eslint/build clean (new `/api/places/photo` route appears in
the build output), curated search unaffected, /planner loads, and the
photo proxy rejects a malformed resource name with 400. The live path
itself (photos/sorting over real data) is production-verifiable only —
no API key in this sandbox.

### 검색 흐름 개선: 그 자리 상세 팝업, 최근 검색 칩, URL 검색 복원

Three user-flow complaints from production testing:

- **카드 클릭 → 그 자리 팝업** (기존: /planner로 통째로 이동): tapping a
  search result card used to `router.push` to /planner and open the
  detail overlay there — losing the whole search context, and coming back
  meant retyping + re-running every API call. Both curated-card and
  live-card taps now open `PlaceDetailOverlay` **as a popup right on
  /discover** (wrapped in an on-demand `MapProvider`, same lazy-script
  pattern as the route preview modal), showing the mini map, the
  구글맵 메뉴·리뷰 link, category/memo editing, 저장하기 (→ 관심 장소 +
  toast, stays on the search results) and 일정에 추가 (→ the existing
  ScheduleModal flow). Closing the popup lands exactly where you were.
- **최근 검색어 상시 노출 칩**: recent searches were only visible as a
  dropdown while the search box was focused — added an always-visible
  "최근 검색" chip row on the browse screen (below the category chips),
  one tap to re-run any of the last 5 searches.
- **URL 검색 복원 + 캐시**: the active search is now mirrored into the URL
  (`/discover?scope=…&q=…` via `history.replaceState`) and restored on
  mount, so browser-back and reloads land on the same results instead of
  a blank box. Both search queries (curated + live) also gained a
  5-minute `staleTime`, so re-running the same search within a session
  serves from React Query's cache instead of re-billing the Google/Kakao
  APIs.

Also answered (no code change): the browse-feed 계절별/최근 핫한 chips do
vary by theme — 계절 is computed from the real current date and 핫한
re-sorts by saves — but over the *curated seed dataset*, not live API
data; making the browse feed live-backed stays a roadmap item
(IMPROVEMENT_PLAN 1-1/R3).

Verified in the browser (7/7): search → card click stays on /discover
with the popup open; 저장하기 shows the toast and returns to intact
results; reload restores the search from the URL; the 최근 검색 chip row
appears on the browse screen and re-runs a search on tap. tsc/eslint/
build clean, no page errors.

### 검색 결과 지도(플래그) 뷰 + 최근검색 스코프 버그 + 큐레이션 대표사진

- **결과 지도 뷰** (`LiveResultsMap.tsx`, new): the 실시간 검색 결과
  section now renders a large map above the card grid with every hit as
  a flag. Tapping a flag opens a compact InfoWindow (name, ⭐rating·리뷰,
  메뉴·리뷰 deep link, 상세·저장 button into the full detail popup);
  tapping a card in the list selects+pans to its flag, so the list and
  map always point at the same place. fitBounds over the result set,
  re-frames per search, single place → street-level zoom. Wrapped in the
  on-demand `MapProvider` (script loads only once live results exist).
- **팝업 상단을 실제 사진으로**: `PlaceDetailOverlay`'s header now shows
  the place's real photo when `photoName` exists (live results), falling
  back to the mini map only for photo-less places (curated/Kakao). This
  also sidesteps the "팝업 지도가 제대로 안 뜬다" report — for live
  results the popup no longer depends on a second map instance at all;
  location context lives on the big results map behind it.
- **최근검색 스코프 버그 수정**: replaying "도톤보리 맛집" from the recent
  chips while the 국내 tab was active silently ran a domestic Kakao
  search → empty. `useRecentSearches` v2 now stores `{q, scope}` per
  entry (new storage key; v1 strings had no scope to migrate), chips show
  a 🇰🇷/🌐 tag, and `runSearch` takes a scope override that switches the
  tab before searching and keeps the URL in sync.
- **큐레이션 카드 대표사진**: new `/api/discover/spot-photo?q=` route —
  searchText(1 result, photos-only mask) by the spot's name+city, then
  302 to the photo's googleusercontent URL. Module-level memo + week-long
  CDN cache headers (on the 404s too) keep it to roughly one billed
  lookup per unique spot per edge region per week. `SpotCard` layers the
  photo over its gradient with an `onError` fallback, so no key / no
  match / local dev just shows the existing gradient — never a broken
  image.

Verified (6/6): overseas search ok; switching to 국내 then tapping the
recent chip auto-restores the 해외 scope and returns results (the exact
reported bug); URL reflects the restored scope; spot-photo returns 404
(not an open proxy) without a key; /planner unaffected. tsc/eslint/build
clean — the results map itself renders placeholder-only here (no key)
and is production-verifiable.

### R2: 일정 영속화 — 새로고침 시 소멸 방지 (실사용 최우선 버그)

The single most damaging bug for real use: the itinerary store's
`partialize` persisted only `savedPlaces`, so `items` (the whole
schedule), `places` (the map catalog), `activeDate`, `currentCity`, and
`region` lived only in memory. A refresh — or closing the tab — silently
wiped the trip the user was building, and reset the header back to the
"Fukuoka · Yufuin" default.

- `partialize` now persists the full itinerary
  (`items`/`places`/`savedPlaces`/`activeDate`/`currentCity`/`region`),
  with a `version: 2` bump. No explicit `migrate` needed — zustand
  shallow-merges the persisted slice over the initial state, so v1's
  `{ savedPlaces }` carries forward and the newly-persisted fields fall
  back to their initial values on first upgrade.
- `currentCity` initial value changed from the leftover hardcoded
  `"Fukuoka · Yufuin"` to a neutral `"새 여행"` — combined with the
  persistence above, the header now reflects the user's actual trip
  across reloads instead of snapping back to the demo city.
- A logged-in user's server save/share (`/api/itineraries`) still layers
  on top of this — localStorage persistence is the always-on baseline so
  an anonymous user never loses work, not a replacement for the DB.

Verified in the browser (5/5): a persisted v2 payload (schedule + city)
rehydrates on reload — the scheduled place shows on the timeline and the
header restores its city; version stays 2; no "Fukuoka" leftover;
tsc/eslint/build clean.
