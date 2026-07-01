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
  **not Prisma** — retried twice, same result both times: this sandbox's
  network policy lets `pg`/`npm` traffic through a proxy, but Prisma's
  engine postinstall downloader dials `binaries.prisma.sh` directly
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

## /travel-scheduler (shadcn/ui + real Google Maps prototype)

A second screen (`src/app/travel-scheduler/`) built from a shadcn/ui +
lucide-react + framer-motion mockup, wired to the same `useItineraryStore`
as the main page — scheduling here updates the same global `items` array.
Its `places` slice is seeded with real Fukuoka/Yufuin coordinates
(`src/lib/mockPlacesFukuokaYufuin.ts`, ~55km apart) instead of the main
app's demo Kyoto list, so `<MapProvider>` (`src/app/travel-scheduler/MapProvider.tsx`)
renders a real, unconditional Google Map — no CSS fallback here — with
`fitBounds` on load and an ordered `<Polyline>` route. Requires
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; without it the map area shows a clean
"Failed to load Google Maps" state (this sandbox has no key to test
against, and its headless-browser QA setup doesn't route through the
outbound proxy the way `curl`/`npm` do, so live tile rendering here is
unverified — the loader's error handling is, though).

### Trend curation sheet + Places search (Phase 4)

- **Trend sheet** (`src/app/travel-scheduler/TrendSheet.tsx`): a shadcn
  `Sheet` (`src/components/ui/sheet.tsx`, portaled into the phone-frame
  mockup rather than the full viewport) listing hashtag-style trend cards
  from `/api/travel-scheduler/trends` — a mock endpoint
  (`src/lib/mockTrends.ts`) standing in for a real curated-DB read, and
  deliberately *not* named `/api/trends` since that path is already the
  main app's real pipeline-backed endpoint. Each card reuses the exact same
  `onDown/onUp/onMove` handlers as map pins, so a tap opens the time-picker
  modal and a ~0.5s hold drags it onto the timeline, identically. Cards are
  merged onto the map (`addPlaces` in the store) as soon as they're
  fetched.
- **Places search** (`src/app/travel-scheduler/PlacesSearchInput.tsx`):
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
