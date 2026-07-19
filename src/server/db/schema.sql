-- Auth.js (@auth/pg-adapter) required tables. Column names/casing match
-- the adapter's raw SQL exactly (node_modules/@auth/pg-adapter/src/index.ts) —
-- do not rename without updating the adapter usage in src/auth.ts.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT,
  UNIQUE (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- App table: one saved itinerary per user. Individual stops (the frontend's
-- `schedule` array of ItineraryItem, src/lib/types.ts) are kept as a JSONB
-- blob rather than a normalized child table, per spec. Each element:
--   { id, placeId, name, date, time, coordinates: {lat, lng}, budget? }
-- `budget` (JPY, optional) was added for Phase 5's cost-tracking feature —
-- JSONB has no per-field migration to run, existing rows without it just
-- read back as `undefined` on the frontend.
--
-- Phase 8 added isPublic/forkedFromId/likesCount/forksCount as groundwork
-- for community features (discover feed, forking, likes) — every new
-- column has a default, so this is backward compatible with existing rows
-- and existing INSERTs that don't mention them (see src/lib/types.ts's
-- `Itinerary` interface and prisma/schema.prisma for the canonical shape;
-- prisma/schema.prisma documents why this hand-written SQL is still the
-- one actually applied here instead of `prisma db push`).
CREATE TABLE IF NOT EXISTS itineraries (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'My Trip',
  region VARCHAR(20) NOT NULL DEFAULT 'international',
  "placesData" JSONB NOT NULL DEFAULT '[]',
  -- App-generated (crypto.randomUUID(), see src/app/api/itineraries/route.ts)
  -- rather than gen_random_uuid() so this doesn't depend on pgcrypto/PG13+.
  -- Anyone with this token can view AND edit the trip — a capability-URL
  -- share model, not per-collaborator accounts.
  "shareToken" VARCHAR(64) UNIQUE,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "forkedFromId" INTEGER REFERENCES itineraries(id) ON DELETE SET NULL,
  "likesCount" INTEGER NOT NULL DEFAULT 0,
  "forksCount" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Defensive ALTERs so re-running this file against a DB that already ran
-- an older version of it (pre-Phase-8) picks up the new columns instead of
-- silently no-op'ing on the CREATE TABLE IF NOT EXISTS above.
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS "forkedFromId" INTEGER REFERENCES itineraries(id) ON DELETE SET NULL;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS "likesCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS "forksCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS itineraries_user_id_idx ON itineraries ("userId");
CREATE INDEX IF NOT EXISTS itineraries_share_token_idx ON itineraries ("shareToken");
CREATE INDEX IF NOT EXISTS itineraries_is_public_idx ON itineraries ("isPublic");

-- Reviews left by someone who actually visited a place. `"placeId"` is an
-- external id (Google Place ID etc.) rather than a local FK — this app has
-- no normalized `places` table, matching how `itineraries."placesData"`
-- already stores places by that same external id.
--
-- `"itineraryId"`/`"placeName"`/`"isPublic"` were added for 여행 보관함's
-- 후기 작성 feature: a review is written per visited place within a
-- specific past trip, denormalizes the place's display name (no `places`
-- table to join against), and defaults private until the author explicitly
-- publishes it to the in-app feed.
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "itineraryId" INTEGER REFERENCES itineraries(id) ON DELETE SET NULL,
  "placeId" VARCHAR(255) NOT NULL,
  "placeName" VARCHAR(255) NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  rating REAL NOT NULL,
  -- GPS or receipt verification of an actual visit — not yet implemented,
  -- defaults false until that lands.
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  -- Uploaded proof-of-visit photo URLs (Vercel Blob).
  images JSONB NOT NULL DEFAULT '[]',
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "itineraryId" INTEGER REFERENCES itineraries(id) ON DELETE SET NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "placeName" VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false;
-- One review per place per trip — writing again edits it in place rather
-- than piling up duplicates. This used to be an inline UNIQUE(...) on the
-- CREATE TABLE above, but that only ever takes effect when the table is
-- first created — on a DB where `reviews` already existed from before
-- itineraryId was added (i.e. every real deployment), CREATE TABLE IF NOT
-- EXISTS silently no-ops and the constraint never actually gets applied.
-- POST /api/reviews's `on conflict ("userId", "itineraryId", "placeId")`
-- then fails with "no unique or exclusion constraint matching the ON
-- CONFLICT specification" (42P10) on every single save. A standalone
-- CREATE UNIQUE INDEX IF NOT EXISTS applies retroactively to an existing
-- table, unlike a constraint declared inside CREATE TABLE.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_itinerary_place_key ON reviews ("userId", "itineraryId", "placeId");

-- The index above never dedupes plan-less reviews ("itineraryId" IS NULL,
-- from "완전 새로 작성"): Postgres treats every NULL as distinct from every
-- other NULL, so it never matches as a conflict target and POST
-- /api/reviews's `on conflict` silently falls through to a plain INSERT —
-- every edit of a plan-less place review just piled up a new row instead of
-- updating the existing one (그 장소가 후기 목록에 사진 있는/없는 버전으로
-- 중복 표시되던 원인). A partial unique index scoped to the NULL rows closes
-- that gap; the API route targets whichever index actually applies.
--
-- The one-time cleanup below MUST run before that index is created — any
-- pre-existing duplicate rows would make CREATE UNIQUE INDEX itself fail
-- (duplicate key value violates unique constraint). It keeps the most
-- recently updated row per (user, place) and drops the rest; a no-op once
-- the dupes are gone, so it's safe to leave in place on every future
-- migrate run.
DELETE FROM reviews r USING reviews newer
WHERE r."itineraryId" IS NULL
  AND newer."itineraryId" IS NULL
  AND r."userId" = newer."userId"
  AND r."placeId" = newer."placeId"
  AND (newer.updated_at, newer.id) > (r.updated_at, r.id);

CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_place_no_itinerary_key ON reviews ("userId", "placeId") WHERE "itineraryId" IS NULL;

CREATE INDEX IF NOT EXISTS reviews_place_id_idx ON reviews ("placeId");
CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON reviews ("userId");
CREATE INDEX IF NOT EXISTS reviews_itinerary_id_idx ON reviews ("itineraryId");
CREATE INDEX IF NOT EXISTS reviews_is_public_idx ON reviews ("isPublic");

-- The overall, blog/Instagram-style write-up of a whole trip — distinct
-- from `reviews`, which are quick per-place rating+comment. A trip_post is
-- the shareable "headline" unit: /feed shows these as big cards, and its
-- own detail page (/trip/[id]) embeds the trip's `reviews` as a read-only
-- "다녀온 장소" section so the two don't require duplicate writing. One
-- post per (user, trip) — writing again edits it in place.
CREATE TABLE IF NOT EXISTS trip_posts (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "itineraryId" INTEGER REFERENCES itineraries(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  -- Uploaded photo URLs (Vercel Blob) — images[0] doubles as the cover
  -- photo, no separate column needed.
  images JSONB NOT NULL DEFAULT '[]',
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Standalone index rather than inline UNIQUE(...) above — see the same note
-- on `reviews`' unique index: a constraint declared inside CREATE TABLE IF
-- NOT EXISTS only ever applies the first time the table is created, so if
-- this table ever grows a column via a later ALTER TABLE (the way `reviews`
-- did), an inline constraint here would silently stop applying on already-
-- deployed databases. CREATE UNIQUE INDEX IF NOT EXISTS applies either way.
CREATE UNIQUE INDEX IF NOT EXISTS trip_posts_user_itinerary_key ON trip_posts ("userId", "itineraryId");
CREATE INDEX IF NOT EXISTS trip_posts_user_id_idx ON trip_posts ("userId");
CREATE INDEX IF NOT EXISTS trip_posts_itinerary_id_idx ON trip_posts ("itineraryId");
CREATE INDEX IF NOT EXISTS trip_posts_is_public_idx ON trip_posts ("isPublic");

-- Server-side cache of place-to-place transit estimates (src/lib/transit.ts
-- computes a Haversine-based fallback today; this table exists so a real
-- Google Distance Matrix result, once wired in, doesn't re-pay the API
-- cost for a repeated A->B/mode lookup).
CREATE TABLE IF NOT EXISTS transit_routes (
  id SERIAL PRIMARY KEY,
  "fromPlaceId" VARCHAR(255) NOT NULL,
  "toPlaceId" VARCHAR(255) NOT NULL,
  "durationMins" INTEGER NOT NULL,
  -- "WALKING" | "TRANSIT" (matches transit.ts's TransitMode in spirit) —
  -- kept as free-form text rather than an ENUM so a new mode doesn't need
  -- a schema migration.
  "transitMode" VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("fromPlaceId", "toPlaceId", "transitMode")
);
