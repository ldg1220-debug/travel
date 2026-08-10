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
  -- The one unnamed "진행 중인 계획" scratchpad row per user, as opposed to
  -- an explicitly-named "저장된 계획" — never shown in the saved-plans list
  -- (see the isDraft filter in src/app/api/itineraries/route.ts GET), just
  -- keeps that draft synced across devices the same way a named plan is.
  "isDraft" BOOLEAN NOT NULL DEFAULT false,
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
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS "isDraft" BOOLEAN NOT NULL DEFAULT false;

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

-- reviews_user_place_no_itinerary_key (userId, placeId) 전역 유니크 인덱스는
-- 파일 뒷부분에서 "tripPostId" 컬럼이 추가되며 reviews_user_trip_post_place_key
-- ("userId", "tripPostId", "placeId")로 대체됐다 — 여기서 다시 만들지 않는다.

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

-- 4-level visibility (전체공개/친구공개/특정인공개/비공개), replacing the
-- old public/private-only "isPublic" boolean. "isPublic" itself is kept in
-- sync (true iff visibility = 'public') rather than dropped, since it's a
-- smaller/older column other tooling may still assume exists.
ALTER TABLE trip_posts ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'private';
UPDATE trip_posts SET visibility = 'public' WHERE "isPublic" = true AND visibility = 'private';
CREATE INDEX IF NOT EXISTS trip_posts_visibility_idx ON trip_posts (visibility);

-- Explicit per-viewer allow-list for a "특정인공개" (visibility = 'custom')
-- post — which of the author's followers can see it.
CREATE TABLE IF NOT EXISTS trip_post_visible_to (
  "postId" INTEGER NOT NULL REFERENCES trip_posts(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY ("postId", "userId")
);

-- One-way follow edges — "친구" (used by visibility = 'friends') means a
-- *mutual* follow: both (A follows B) and (B follows A) rows exist. Kept as
-- simple one-way edges rather than a request/approve flow so following is
-- always immediate; only the "친구" label/gate requires the other side to
-- follow back.
CREATE TABLE IF NOT EXISTS follows (
  id SERIAL PRIMARY KEY,
  "followerId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "followingId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS follows_pair_key ON follows ("followerId", "followingId");
CREATE INDEX IF NOT EXISTS follows_follower_idx ON follows ("followerId");
CREATE INDEX IF NOT EXISTS follows_following_idx ON follows ("followingId");

-- 'pending' | 'accepted' — 트래블 메이트 신청은 상대가 수락하기 전까진 실제
-- 관계로 카운트되거나 메이트공개 등을 게이트하지 않는다. 이 컬럼이 생기기 전
-- 행은 전부 승인 없는 즉시 팔로우로 만들어졌으므로 기본값 'accepted'로 하위호환.
ALTER TABLE follows ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'accepted';

-- 트래블 메이트는 상호 관계 — 수락 시 양방향 엣지가 함께 만들어지고, 끊을
-- 때도 양쪽이 함께 지워진다. 즉시 팔로우 시절의 한 방향짜리 수락 엣지를
-- 반대 방향으로도 미러링해 과거 데이터도 대칭으로 맞춘다. (메이트 해제는
-- 양방향을 모두 지우므로 이 미러링이 끊은 관계를 되살리는 일은 없다 —
-- 재실행해도 안전한 멱등 백필)
INSERT INTO follows ("followerId", "followingId", status)
SELECT f."followingId", f."followerId", 'accepted' FROM follows f WHERE f.status = 'accepted'
ON CONFLICT ("followerId", "followingId") DO NOTHING;

-- Public-facing display identity, chosen by the user at profile setup —
-- decoupled from the OAuth-provided `name`/`email` (never rendered to other
-- users) for privacy. NULL until the user completes the mandatory first-run
-- profile setup gate. Case-insensitive uniqueness via a partial index so
-- multiple NULLs (pre-onboarding users) don't conflict with each other.
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_key ON users (lower(nickname)) WHERE nickname IS NOT NULL;

-- 이용약관·개인정보처리방침 동의 시각 — 최초 가입 게이트(닉네임 설정
-- 화면)에서 필수 동의를 받고 기록한다. NULL이면 아직 동의 전이므로 게이트가
-- 다시 뜬다(약관 도입 전 기존 가입자도 다음 접속 때 동의를 거치게 됨).
ALTER TABLE users ADD COLUMN IF NOT EXISTS "termsAgreedAt" TIMESTAMPTZ;

-- 알림 종류별 on/off — 기본은 둘 다 켜짐. 트래블 메이트 신청/수락 알림은 하나로
-- 묶는다(사용자 입장에서 굳이 나눌 이유가 없는 같은 맥락의 알림), 좋아요는
-- 별개로 끌 수 있게 분리.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "notifyMateRequests" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "notifyLikes" BOOLEAN NOT NULL DEFAULT true;
-- 새 메시지 알림 on/off — 메시지 기능이 나온 뒤 추가된 세 번째 종류.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "notifyMessages" BOOLEAN NOT NULL DEFAULT true;

-- 1:1 다이렉트 메시지. 신고/차단 등 모더레이션 인프라가 아직 없어서 첫
-- 버전은 서로 트래블 메이트인 사이에서만 보낼 수 있게 애플리케이션
-- 레이어(POST /api/messages)에서 제한한다 — 이미 있는 메시지 기록은
-- 메이트 관계가 끊긴 뒤에도 계속 읽을 수 있다(새로 보내는 것만 막힘).
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  "senderId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "recipientId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 보낸 메시지 삭제("나에게서만"이 아니라 양쪽 모두에서 사라지는 방식) —
-- 행을 지우지 않고 content를 비우고 deleted만 세워서, 대화 순서/개수가
-- 삭제 후에도 흐트러지지 않게 한다.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT false;
-- 두 사용자 사이의 대화 하나를 방향과 무관하게 빠르게 모아 조회하기 위한
-- 인덱스 — least/greatest로 (A,B)든 (B,A)든 같은 키가 되게 정규화한다.
CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON messages (least("senderId", "recipientId"), greatest("senderId", "recipientId"), created_at);
CREATE INDEX IF NOT EXISTS messages_recipient_unread_idx ON messages ("recipientId", read);

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

-- 여행 후기(trip_posts) 좋아요. 팔로우와 마찬가지로 승인 없는 즉시 토글이라
-- 단순 조인 테이블로 충분 — ON DELETE CASCADE로 게시글/유저 삭제 시 자동 정리.
CREATE TABLE IF NOT EXISTS trip_post_likes (
  id SERIAL PRIMARY KEY,
  "postId" INTEGER NOT NULL REFERENCES trip_posts(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trip_post_likes_pair_key ON trip_post_likes ("postId", "userId");
CREATE INDEX IF NOT EXISTS trip_post_likes_post_idx ON trip_post_likes ("postId");

-- 우측 상단 알림 벨의 데이터 소스 — 팔로우/좋아요처럼 "다른 사람이 나에게
-- 한 행동"이 생길 때마다 한 행을 남긴다. 액터 본인에게는 절대 쌓이지
-- 않도록(자기 글에 좋아요 등) 애플리케이션 레이어에서 걸러서 insert한다.
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  "recipientId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "actorId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'follow_request' | 'follow_accept' | 'like'
  type VARCHAR(20) NOT NULL,
  "postId" INTEGER REFERENCES trip_posts(id) ON DELETE CASCADE,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications ("recipientId", created_at DESC);
-- 'follow_request'가 원래 정의(VARCHAR(10))로는 잘려 이미 배포된 DB의
-- 컬럼도 넓힌다 — VARCHAR 길이 확장은 Postgres에서 메타데이터만 바뀌는
-- 즉시 처리라 큰 테이블에서도 안전하다.
ALTER TABLE notifications ALTER COLUMN type TYPE VARCHAR(20);

-- 관리자 전체 공지('announcement' type): 특정 상대 행동이 아니라 관리자가
-- 직접 작성한 문구를 담아야 해서 message 컬럼이 필요하고, 액터도 실제
-- "나에게 어떤 행동을 한 사람"이 아니라 발송한 관리자일 뿐이라 계정이
-- 삭제돼도(ON DELETE CASCADE) 이미 보낸 공지까지 전부 사라지면 안 되므로
-- NOT NULL을 풀어둔다.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE notifications ALTER COLUMN "actorId" DROP NOT NULL;

-- 관리자 여부 — 별도 가입 플로우 없이 운영자 이메일로 지정한다. 이메일이
-- 그대로인 한 재실행해도 안전한 멱등 UPDATE(값이 이미 true여도 no-op).
ALTER TABLE users ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;
UPDATE users SET "isAdmin" = true WHERE email = 'ldg1220@naver.com';

-- 신고 처리로 정지된 계정 — true면 로그인 자체를 막는다(src/auth.ts의
-- signIn 콜백).
ALTER TABLE users ADD COLUMN IF NOT EXISTS "isBanned" BOOLEAN NOT NULL DEFAULT false;

-- 관리자 대시보드(가입 추이·활성 사용자)용. Auth.js 어댑터가 관리하는 원본
-- users 테이블(맨 위 CREATE TABLE)엔 가입 시각이 없어서 추가했다 — 이
-- ALTER가 처음 실행되는 시점에 이미 있던 계정은 실제 가입일을 알 방법이
-- 없으므로 DEFAULT now()로 그 시점 기준으로 채워진다(그 이후 신규가입부터
-- 정확함). "lastActiveAt"은 NULL 허용 — 세션 콜백(src/auth.ts)이 5분에
-- 한 번꼴로만 갱신하므로(매 요청 쓰기 방지) "최근 access"가 아니라
-- "대략 최근 5분 단위 활성" 정도로 해석해야 한다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users ("createdAt");
CREATE INDEX IF NOT EXISTS users_last_active_idx ON users ("lastActiveAt");

-- 신고 접수: 여행 후기(trip_post)·메시지·사용자 프로필을 대상으로 로그인한
-- 누구나 접수할 수 있다(POST /api/reports). "targetId"는 targetType에 따라
-- 다른 테이블을 가리키므로(targetType='user'일 땐 그 자체가 대상 유저 id)
-- 강한 FK를 걸지 않는다 — 신고된 게시물이 나중에 삭제돼도 신고 이력과
-- 처리 결과는 그대로 남아야 한다. "reportedUserId"는 신고 접수 시점에
-- targetType별로 조회해 채워두는 대상자 캐시(게시물이 삭제된 뒤에도 누구를
-- 신고한 것이었는지 알 수 있도록).
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  "reporterId" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "reportedUserId" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- 'trip_post' | 'community_post' | 'message' | 'user'
  "targetType" VARCHAR(20) NOT NULL,
  "targetId" INTEGER NOT NULL,
  -- 'spam' | 'abuse' | 'sexual' | 'illegal' | 'other'
  reason VARCHAR(20) NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  -- 'pending' | 'reviewing' | 'resolved' | 'dismissed'
  status VARCHAR(12) NOT NULL DEFAULT 'pending',
  "adminNote" TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_reported_user_idx ON reports ("reportedUserId");

-- 계획 없는("완전 새로 작성") 여행 후기의 "다녀온 장소"는 원래 (userId,
-- placeId)로만 스코프돼 있었다 — itineraryId가 없는 리뷰 전부가 유저 한
-- 명당 하나의 전역 목록처럼 취급돼서, 새 글을 써도 예전에 다른 글에서
-- 남긴 장소 리뷰가 그대로 딸려 들어오는 버그가 있었다(글을 지우고 새로
-- 써도 재현됨). 이제 어느 trip_posts 글에 속하는지 명시적으로 남겨서
-- 글 단위로 스코프한다 — trip_posts보다 나중에 정의되므로 파일 뒷부분에서
-- 참조 컬럼을 추가한다. 계획에 묶인 리뷰(itineraryId not null)는 원래도
-- itineraryId로 정확히 스코프됐으므로 그대로 둔다.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "tripPostId" INTEGER REFERENCES trip_posts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS reviews_trip_post_id_idx ON reviews ("tripPostId");

-- 예전 인덱스는 유저+장소당 전역으로 하나만 허용해서 같은 장소를 서로 다른
-- 계획 없는 글 두 개에 각각 남길 수 없게 막았다 — tripPostId 스코프로
-- 대체한다. tripPostId가 아직 없는(글을 먼저 저장하기 전) 레거시/과도기
-- 행에는 이 제약을 적용하지 않는다 — 새로 쓰는 리뷰는 API 레벨에서 항상
-- tripPostId를 먼저 채운 뒤에만 저장되도록 강제한다(POST /api/reviews).
DROP INDEX IF EXISTS reviews_user_place_no_itinerary_key;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_trip_post_place_key
  ON reviews ("userId", "tripPostId", "placeId") WHERE "itineraryId" IS NULL AND "tripPostId" IS NOT NULL;

-- 앱을 홈 화면에 설치했을 때(PWA) 실제 OS 팝업으로 뜨는 푸시 알림 구독
-- 정보 — 브라우저/기기 하나당 한 구독(endpoint가 그 조합의 고유 식별자).
-- 로그아웃해도 남겨두면 다른 계정으로 로그인 시 엉뚱한 사람에게 알림이
-- 갈 수 있으므로, 구독은 세션이 아니라 계정에 묶고 로그아웃 시 클라이언트가
-- 명시적으로 해지 요청을 보낸다(POST /api/push/unsubscribe).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions ("userId");

-- 남용 방지용 고정 윈도우 레이트 리밋 (src/lib/server/rateLimit.ts). Redis
-- 없이 이미 있는 Postgres 하나로 처리 — key는 "라우트:사용자id" 형태로
-- 호출부에서 조립한다. 행이 계속 쌓이지는 않는다(키당 최대 1행, upsert).
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  "windowStart" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 회원 탈퇴에 이메일 확인 + 유예기간을 추가한다(src/lib/server/accountDeletion.ts).
-- "탈퇴하기"를 눌러도 즉시 삭제되지 않고, 가입 이메일로 보낸 확인 링크를
-- 눌러야만("deletionToken"이 일치 + 미만료) "deletionRequestedAt"이 채워져
-- 유예기간이 시작된다 — 앱 안에서 버튼만 누르는 것으로는(이메일 소유 확인
-- 전) 탈퇴가 진행되지 않게 하기 위함. 유예기간 중에는 로그인해도 자동으로
-- 취소되지 않고(요청자 확인) 명시적으로 "계정 살리기"를 눌러야 취소된다.
-- 유예기간이 지나면 크론(/api/cron/purge-deleted-accounts)이 영구 삭제한다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "deletionToken" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "deletionTokenExpiresAt" TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_deletion_requested_idx ON users ("deletionRequestedAt") WHERE "deletionRequestedAt" IS NOT NULL;

-- 여행 후기(trip_posts) 댓글 — 그 글의 공개범위(visibility)를 볼 수 있는
-- 사람만 댓글도 보고 남길 수 있다(읽기·쓰기 모두 src/lib/server/
-- tripPostVisibility.ts의 canViewTripPost로 좋아요/조회와 같은 기준을
-- 재검증한다). 작성자 본인 또는 그 글의 주인이 지울 수 있다(글 주인에게도
-- 모더레이션 목적으로 삭제 권한을 준다).
CREATE TABLE IF NOT EXISTS trip_post_comments (
  id SERIAL PRIMARY KEY,
  "postId" INTEGER NOT NULL REFERENCES trip_posts(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_post_comments_post_idx ON trip_post_comments ("postId", created_at);

ALTER TABLE users ADD COLUMN IF NOT EXISTS "notifyComments" BOOLEAN NOT NULL DEFAULT true;

-- 커뮤니티 게시판 — 여행 후기(trip_posts)와는 별개로, 카테고리별로 자유롭게
-- 정보를 주고받는 게시판(자유수다/질문답변/동행 구해요/여행 꿀팁/국내
-- 정보공유/해외 정보공유). 카테고리는 운영진이 코드로 관리하는 고정 목록이라
-- (src/lib/community.ts의 COMMUNITY_CATEGORIES) 별도 테이블로 빼지 않았다.
-- 글쓰기는 로그인한 회원만 가능하고(비로그인 작성 불가), 열람 범위는
-- "visibility"로 글마다 고른다:
--  - "public": 비로그인 포함 누구나
--  - "members": 로그인한 회원이면 누구나(팔로우 관계 무관 — 여행 후기의
--    "친구공개(맞팔로우)"보다 넓은 개념이라 트립포스트와는 다른 값 이름을 쓴다)
--  - "custom": 글쓴이가 지정한 허용 목록(community_post_visible_to)만
--  - "private": 글쓴이 본인만
CREATE TABLE IF NOT EXISTS community_posts (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(24) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  images JSONB NOT NULL DEFAULT '[]',
  visibility VARCHAR(10) NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_posts_category_idx ON community_posts (category, created_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_user_idx ON community_posts ("userId");

-- "특정인 공개" 글의 허용 목록 — 여행 후기의 trip_post_visible_to와 같은 모양.
CREATE TABLE IF NOT EXISTS community_post_visible_to (
  "postId" INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY ("postId", "userId")
);

-- 커뮤니티 글 댓글 — 그 글을 볼 수 있는 사람만 댓글도 보고 남길 수 있다
-- (src/lib/server/communityVisibility.ts의 canViewCommunityPost로 재검증).
-- 작성자 본인 또는 글 주인이 지울 수 있다.
CREATE TABLE IF NOT EXISTS community_post_comments (
  id SERIAL PRIMARY KEY,
  "postId" INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_post_comments_post_idx ON community_post_comments ("postId", created_at);

-- 커뮤니티 글 좋아요 — 여행 후기의 trip_post_likes와 같은 모양.
CREATE TABLE IF NOT EXISTS community_post_likes (
  id SERIAL PRIMARY KEY,
  "postId" INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS community_post_likes_pair_key ON community_post_likes ("postId", "userId");
CREATE INDEX IF NOT EXISTS community_post_likes_post_idx ON community_post_likes ("postId");

-- notifications 테이블은 이 파일 위쪽(community_posts보다 먼저)에 정의돼
-- "postId"가 trip_posts만 가리킬 수 있다 — 커뮤니티 글의 좋아요/댓글
-- 알림은 별도 컬럼으로 가리킨다. 알림 하나는 둘 중 하나만 채워진다.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "communityPostId" INTEGER REFERENCES community_posts(id) ON DELETE CASCADE;

-- "트레쥴 프리미엄" 멤버십 뼈대 — 결제 연동(PG) 전이라 아직 실제로 켤 수
-- 있는 경로는 없다(설정 화면엔 비활성화된 "준비중" 버튼만 노출). 나중에
-- 결제가 붙으면 이 두 컬럼만 채우면 되도록 미리 준비해둔다. "premiumUntil"
-- 이 NULL이면 비회원, 과거 시각이면 만료된 것으로 취급(별도 배치 정리
-- 없이 조회 시점에 now()와 비교해서 판단).
ALTER TABLE users ADD COLUMN IF NOT EXISTS "isPremium" BOOLEAN NOT NULL DEFAULT false;

-- 비로그인 방문자 집계 (관리자 대시보드) — 로그인한 사용자는 이미
-- users."lastActiveAt"으로 활동을 추적하므로, 여기는 그 바깥의 비로그인
-- 방문만 센다. 개인 식별 정보(IP, 쿠키, 기기 등)는 전혀 저장하지 않고
-- 날짜별 총 조회 수만 누적한다 — src/app/api/track/visit/route.ts가
-- 비로그인 상태로 앱이 열릴 때마다 오늘 날짜 행을 1씩 증가시킨다.
CREATE TABLE IF NOT EXISTS visitor_counts (
  day DATE PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);
-- Supabase's Security Advisor flags any public-schema table with RLS off as
-- exposed to PostgREST. The app itself never touches this table through
-- PostgREST/supabase-js — every query here goes through the pooled `pg`
-- connection in src/lib/server/db.ts using DATABASE_URL's own role, which
-- isn't subject to RLS — so enabling it with no policies just closes off
-- the (unused) anon/authenticated REST API path with zero effect on the app.
ALTER TABLE visitor_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "premiumUntil" TIMESTAMPTZ;

-- AI 추천 코스 v2(src/lib/server/courseRecommendV2.ts, COURSE_PIPELINE=v2)의
-- courseId -> 슬롯별 쇼트리스트/원본 후보 풀 캐시. 애초엔 프로세스 메모리
-- Map으로 뒀었는데, 실측(Vercel 프리뷰)에서 리롤 요청이 코스를 생성한
-- 서버리스 인스턴스와 다른 인스턴스로 갈 때마다 "코스를 찾을 수 없음"이
-- 재현돼(콜드스타트 포함, 인스턴스 간 메모리 공유 안 됨) 이 테이블로
-- 옮겼다. payload는 CachedCourse를 그대로 직렬화한 JSONB — 스키마가 아직
-- v2 자체가 실험 단계라 자주 바뀔 수 있어 컬럼을 쪼개지 않았다.
CREATE TABLE IF NOT EXISTS course_cache (
  id UUID PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_cache_created_at_idx ON course_cache (created_at);
-- visitor_counts와 같은 이유(PostgREST 미사용, pg Pool로만 접근) — RLS만 켜서 정책 없이 막아둔다.
ALTER TABLE course_cache ENABLE ROW LEVEL SECURITY;

-- AI 추천 코스(v1/v2 공용, src/lib/server/courseRecommend.ts의
-- fetchSlotCandidates)의 도시×슬롯 검색 결과 캐시. 실측에서 응답시간
-- 8~14초의 상당 부분이 슬롯 7개의 라이브 Google/Kakao 검색이었고,
-- 인기 도시(서울/부산/오사카 등)는 여러 사용자가 반복 요청하므로 캐시
-- 히트율이 높을 것으로 기대 — 같은 만큼 Places API 비용도 줄어든다
-- (Places New는 요청 1건당 과금이라 재검색을 안 하면 그만큼 그대로 절감).
-- cache_key는 실제 API 호출을 결정하는 파라미터(scope+city+keyword+
-- category)로 만든다 — courseRecommend.ts의 candidateCacheKey() 참고.
CREATE TABLE IF NOT EXISTS place_candidate_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS place_candidate_cache_created_at_idx ON place_candidate_cache (created_at);
ALTER TABLE place_candidate_cache ENABLE ROW LEVEL SECURITY;

-- 플래너의 "숙소 예약" CTA(src/lib/affiliates.ts 연동, PlannerBoard.tsx)
-- 전환 추적. 지금은 예약사가 실제 결제까지 갔는지 알 방법이 없으니(딥
-- 링크가 각 사 검색 결과 페이지로 열릴 뿐), 최소한 "몇 명이 CTA를
-- 열었고 몇 명이 실제 예약사 링크까지 눌렀는지"는 여기서 보고 앞서 세운
-- 매출 모델의 전환율 가정을 실측으로 바꿀 수 있게 한다. kind='open'은
-- 팝업을 연 시점(아직 어느 예약사인지 모름 — provider/is_affiliate는
-- null), kind='click'은 특정 예약사 링크를 실제로 누른 시점.
-- placement는 CTA가 어디 있었는지('header' | 'timeline') — 두 위치 중
-- 어디가 더 잘 전환되는지 나중에 비교할 수 있게 같이 남긴다.
CREATE TABLE IF NOT EXISTS lodging_cta_events (
  id BIGSERIAL PRIMARY KEY,
  "userId" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  placement TEXT NOT NULL,
  city TEXT NOT NULL,
  region TEXT NOT NULL,
  provider TEXT,
  is_affiliate BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lodging_cta_events_created_at_idx ON lodging_cta_events (created_at);
CREATE INDEX IF NOT EXISTS lodging_cta_events_kind_placement_idx ON lodging_cta_events (kind, placement);
ALTER TABLE lodging_cta_events ENABLE ROW LEVEL SECURITY;

-- /discover 큐레이션 카드(discoverData.ts, spot.id 기준)의 실제 Google
-- Places 지표. spot_id → place_id 매칭은 scripts/match-spot-place-ids.ts로
-- 1회성(수동 검토 후) 확정하고, 이후 rating/review_count/opening_hours는
-- /api/cron/refresh-spot-metrics가 월 1회 배치로 채운다 — 사용자 조회마다
-- 실시간 호출하면 Enterprise SKU 월 무료 한도(1,000회)를 바로 넘는다.
-- opening_hours는 카드에 아직 안 쓰지만, GitHub #156(운영시간 개념 부재로
-- 스팟이 영업 전 시간대에 배정된 문제)에서 그대로 재사용하려고 같이
-- 저장해둔다. Google ToS상 place_id는 무기한 보관 가능하지만 rating 등
-- 콘텐츠는 30일 초과 보관이 제한돼 있어 updated_at을 두고, 배치가
-- 30일 이상 못 돈 로우는 조회 시 "만료"로 취급해 지표를 숨긴다(코드에서
-- 처리 — 여기서 강제 삭제하지는 않음, 다음 배치가 돌면 다시 갱신되므로).
CREATE TABLE IF NOT EXISTS spot_place_metrics (
  spot_id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  rating REAL,
  review_count INTEGER,
  price_level SMALLINT,
  opening_hours JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE spot_place_metrics ENABLE ROW LEVEL SECURITY;
