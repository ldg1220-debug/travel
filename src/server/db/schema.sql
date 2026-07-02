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
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "placeId" VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  rating REAL NOT NULL,
  -- GPS or receipt verification of an actual visit — not yet implemented,
  -- defaults false until that lands.
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  -- Uploaded proof-of-visit photo URLs/paths.
  images JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_place_id_idx ON reviews ("placeId");
CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON reviews ("userId");

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
