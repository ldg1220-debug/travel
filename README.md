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
