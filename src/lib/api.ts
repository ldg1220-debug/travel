import type { ItineraryItem, Place, Region } from "./types";
import type { CuisineTag, DiscoverBundle, DiscoverScope, DiscoverSpot, DiscoverRoute, PlaceCategoryTag, RegionNode, Season } from "./discoverData";

export async function fetchTrendingPlaces(region: Region): Promise<Place[]> {
  const res = await fetch(`/api/trends?region=${region}`);
  if (!res.ok) throw new Error("Failed to load trending places");
  const data = (await res.json()) as { places: Place[] };
  return data.places;
}

export async function searchPlaces(region: Region, query: string): Promise<Place[]> {
  if (!query.trim()) return [];
  const res = await fetch(`/api/places/search?region=${region}&q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Search failed");
  const data = (await res.json()) as { places: Place[] };
  return data.places;
}

/** Loose category hint for /api/places/search's query-expansion — best-effort, not an exact match to /discover's own tag set. */
function placesSearchCategory(tag?: string): string | undefined {
  if (tag === "관광지" || tag === "테마파크") return "attraction";
  if (tag === "음식점" || tag === "술집") return "restaurant";
  if (tag === "숙소") return "lodging";
  return undefined;
}

/**
 * Real, live place search backing /discover's "실시간 검색 결과" — hits the
 * same Google Places Text Search (overseas) / Kakao Local keyword search
 * (domestic) already used by /planner's sidebar, so an arbitrary real store
 * name (not just /discover's own curated seed list) can actually be found,
 * with real ratings where the underlying API provides them. Never throws:
 * missing API keys, a live-API error, or a network failure all just mean
 * "no live results this time" rather than breaking the rest of the search
 * page, since /discover's curated results are still shown regardless.
 */
export async function fetchLivePlaceSearch(scope: DiscoverScope, query: string, tag?: string): Promise<Place[]> {
  if (!query.trim()) return [];
  try {
    const region: Region = scope === "domestic" ? "domestic" : "international";
    const params = new URLSearchParams({ region, q: query });
    const category = placesSearchCategory(tag);
    if (category) params.set("category", category);
    const res = await fetch(`/api/places/search?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { places?: Place[]; source?: "google" | "kakao" | "mock" };
    // "mock" means the route had no real API key (or the live call itself
    // failed) and quietly fell back to a cached/offline place list — showing
    // that under a "실시간 검색 결과 · 실제 장소" heading would be misleading,
    // so only a genuine google/kakao hit counts as a live result here.
    if (data.source !== "google" && data.source !== "kakao") return [];
    return data.places ?? [];
  } catch {
    return [];
  }
}

export interface PlaceDetails {
  photoNames: string[];
  reviews: { author: string; rating: number | null; text: string; when: string }[];
  rating: number | null;
  reviewCount: number | null;
  openNow: boolean | null;
}

/** Google reviews + photo gallery for the detail popup — the in-app stand-in for the menu tab (Places API exposes no menu data). Returns null on any failure so the caller can just hide the section. */
export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  if (!placeId.trim()) return null;
  try {
    const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
    if (!res.ok) return null;
    return (await res.json()) as PlaceDetails;
  } catch {
    return null;
  }
}

export interface RecommendedStop extends Place {
  /** Which day-course slot this stop fills (e.g. "lunch") — used to reroll just this stop via fetchRerolledStop. */
  slotKey: string;
  slotLabel: string;
  hour: number;
  meal: boolean;
  /** One-line recommendation rationale — only present when the LLM curation layer ran (LLM_API_KEY set). */
  reason?: string;
}

/** 코스 테마 — 하루 골격/키워드를 바꾼다. server의 THEME_SLOTS와 키가 일치해야 함. */
export type CourseTheme = "balanced" | "foodie" | "healing" | "culture" | "active";

/** AI 추천 동선 — a full auto-assembled day course of real top-rated places for a city, shaped by `theme`. Empty array when the live API is unavailable (no key). */
export async function fetchRecommendedCourse(scope: DiscoverScope, city: string, theme: CourseTheme = "balanced"): Promise<RecommendedStop[]> {
  if (!city.trim()) return [];
  try {
    const res = await fetch(`/api/course/recommend?scope=${scope}&city=${encodeURIComponent(city)}&theme=${theme}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { course?: RecommendedStop[]; source?: string };
    // "llm" = Claude-curated, "google"/"kakao" = deterministic ranker; all are real live results. "mock" = no API key.
    if (data.source !== "google" && data.source !== "kakao" && data.source !== "llm") return [];
    return data.course ?? [];
  } catch {
    return [];
  }
}

/**
 * "다른 곳 추천" — replaces a single stop of an already-built AI course
 * without regenerating the whole day. `currentCourse` supplies the
 * exclude-list (so the reroll never repeats a place already shown) and an
 * anchor point (the previous stop, if any) for proximity ranking. Returns
 * null if no alternative was found (e.g. the pool is exhausted).
 */
export async function fetchRerolledStop(
  scope: DiscoverScope,
  city: string,
  theme: CourseTheme,
  slotKey: string,
  currentCourse: RecommendedStop[],
): Promise<RecommendedStop | null> {
  if (!city.trim()) return null;
  const idx = currentCourse.findIndex((s) => s.slotKey === slotKey);
  const anchor = idx > 0 ? currentCourse[idx - 1] : null;
  const params = new URLSearchParams({
    scope,
    city,
    theme,
    slot: slotKey,
    excludeIds: currentCourse.map((s) => s.id).join(","),
    excludeNames: currentCourse.map((s) => encodeURIComponent(s.name)).join(","),
  });
  if (anchor) {
    params.set("anchorLat", String(anchor.lat));
    params.set("anchorLng", String(anchor.lng));
  }
  try {
    const res = await fetch(`/api/course/recommend/reroll?${params.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { stop?: RecommendedStop | null };
    return data.stop ?? null;
  } catch {
    return null;
  }
}

/**
 * Creates or updates one of the current user's server-side itineraries.
 * Pass `id` (a SavedPlan's own `remoteId`, if it has one) to update that
 * specific plan in place and reuse its existing shareToken — omitting it
 * always creates a new row, so saving/sharing a plan that was never synced
 * before doesn't collide with any other plan's row.
 */
export async function saveItinerary(
  region: Region,
  placesData: ItineraryItem[],
  title?: string,
  id?: number,
  isDraft?: boolean,
): Promise<{ id: number; shareToken: string }> {
  const res = await fetch("/api/itineraries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, region, placesData, title, isDraft }),
  });
  if (!res.ok) throw new Error("Failed to save itinerary");
  return res.json();
}

export interface UserItinerary {
  id: number;
  title: string;
  region: Region;
  placesData: ItineraryItem[];
  shareToken: string;
}

/**
 * Every itinerary the logged-in user has saved/shared across any device —
 * used to hydrate 저장된 계획 on login, including reconciling plans deleted
 * from another device — plus the one unnamed 진행 중인 계획 draft row
 * separately, if one exists. Throws (rather than resolving to `[]`) on a
 * failed request, so a transient network/server hiccup can't be mistaken
 * for "this account genuinely has zero itineraries" and wipe every
 * locally-synced plan during reconciliation.
 */
export async function fetchUserItineraries(): Promise<{ itineraries: UserItinerary[]; draft: UserItinerary | null }> {
  const res = await fetch("/api/itineraries");
  if (!res.ok) throw new Error("Failed to fetch itineraries");
  const data = (await res.json()) as { itineraries?: UserItinerary[]; draft?: UserItinerary | null };
  return { itineraries: data.itineraries ?? [], draft: data.draft ?? null };
}

/**
 * Deletes a saved plan's server-side row. Without this, deleting a synced
 * plan only ever removed it from this device's local list — the next
 * cross-device hydration (e.g. a page refresh) would fetch the still-alive
 * server row and pull it right back in as a "new" plan.
 */
export async function deleteItinerary(id: number): Promise<void> {
  const res = await fetch(`/api/itineraries?id=${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("계획을 삭제하지 못했어요");
}

export interface SharedItinerary {
  title: string;
  region: Region;
  placesData: ItineraryItem[];
  updatedAt: string;
}

/** A shared link is a read-only snapshot as of when it was created/last re-shared — nothing pushes edits back to it automatically. */
export async function fetchSharedItinerary(shareToken: string): Promise<SharedItinerary> {
  const res = await fetch(`/api/itineraries/shared/${shareToken}`);
  if (!res.ok) throw new Error("Failed to load shared itinerary");
  return res.json();
}

export interface Review {
  id: number;
  itineraryId: number | null;
  tripPostId?: number | null;
  placeId: string;
  placeName: string;
  rating: number;
  content: string;
  images: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Uploads one or more 후기 photos to Vercel Blob, returning their public URLs. */
export async function uploadReviewPhotos(files: File[]): Promise<string[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    // A non-JSON response here (data stays null) means the request never
    // reached our route handler at all — e.g. rejected upstream for being
    // too large — rather than one of our own JSON error replies.
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "사진 업로드에 실패했어요. 잠시 후 다시 시도해주세요");
  }
  const data = (await res.json()) as { urls: string[] };
  return data.urls;
}

/** Updates the current user's nickname and/or avatar. `image: null` clears it back to the initial-letter fallback. */
export async function updateProfile(input: {
  nickname?: string;
  image?: string | null;
  agreeTerms?: boolean;
  notifyMateRequests?: boolean;
  notifyLikes?: boolean;
  notifyMessages?: boolean;
}): Promise<void> {
  const res = await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "저장에 실패했어요");
  }
}

/** 회원 탈퇴 — 계정과 모든 데이터를 영구 삭제한다. 되돌릴 수 없다. */
export async function deleteAccount(): Promise<void> {
  const res = await fetch("/api/account", { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "탈퇴 처리에 실패했어요");
  }
}

/** Every review the current user has written, optionally scoped to one trip — used to prefill 후기 작성 and show per-trip progress. */
export async function fetchMyReviews(itineraryId?: number): Promise<Review[]> {
  const url = itineraryId ? `/api/reviews?itineraryId=${itineraryId}` : "/api/reviews";
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { reviews?: Review[] };
  return data.reviews ?? [];
}

/**
 * Creates or updates the current user's review for a place. `itineraryId`
 * null means it's not tied to a saved plan — a plan-less review must then
 * instead be scoped to a specific `tripPostId` (which trip post it's the
 * "다녀온 장소" for), never both null.
 */
export async function saveReview(input: {
  itineraryId: number | null;
  tripPostId?: number | null;
  placeId: string;
  placeName: string;
  rating: number;
  content: string;
  images: string[];
  isPublic: boolean;
}): Promise<{ id: number }> {
  const res = await fetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to save review");
  return res.json();
}

export async function deleteReview(id: number): Promise<void> {
  const res = await fetch(`/api/reviews?id=${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("후기를 삭제하지 못했어요");
}

/** 전체공개 / 트메공개(맞팔로우만) / 특정인공개(선택한 팔로워만) / 비공개(나만). */
export type Visibility = "public" | "friends" | "custom" | "private";

export interface TripPost {
  id: number;
  itineraryId: number | null;
  title: string;
  content: string;
  images: string[];
  visibility: Visibility;
  /** Only populated when visibility is "custom" — the allowed viewers' user ids. */
  visibleToUserIds: number[];
  createdAt: string;
  updatedAt: string;
}

/** The current user's own trip post for a specific trip, if they've written one — used to prefill 여행 후기 쓰기. */
export async function fetchMyTripPost(itineraryId: number): Promise<TripPost | null> {
  const res = await fetch(`/api/trip-posts?itineraryId=${itineraryId}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { posts?: TripPost[] };
  return data.posts?.[0] ?? null;
}

/** Every trip post the current user has ever written, most recently edited first — used to tell 여행 보관함 which saved plans have actually been written about ("다녀온 여행"), and to list/re-open posts that aren't tied to any saved plan. */
export async function fetchMyTripPosts(): Promise<TripPost[]> {
  const res = await fetch("/api/trip-posts");
  if (!res.ok) return [];
  const data = (await res.json()) as { posts?: TripPost[] };
  return data.posts ?? [];
}

/**
 * Creates or updates the current user's overall blog/Instagram-style
 * write-up for a trip. Pass `id` to update that specific post directly
 * (needed once it's not tied to a plan, since there's nothing else to
 * upsert against); otherwise `itineraryId` upserts the one post for that
 * plan, or omit both for a wholly fresh, plan-less post.
 */
export async function saveTripPost(input: {
  id?: number;
  itineraryId?: number | null;
  title: string;
  content: string;
  images: string[];
  visibility: Visibility;
  /** Required when visibility is "custom" — ignored otherwise. */
  visibleToUserIds?: number[];
}): Promise<{ id: number }> {
  const res = await fetch("/api/trip-posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to save trip post");
  return res.json();
}

export async function deleteTripPost(id: number): Promise<void> {
  const res = await fetch(`/api/trip-posts?id=${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("삭제하지 못했어요");
}

export interface FeedPost {
  id: number;
  title: string;
  content: string;
  images: string[];
  createdAt: string;
  authorId: number;
  authorName: string | null;
  authorImage: string | null;
  tripTitle: string | null;
  /** The linked trip's region, if any — null for a plan-less ("완전 새로 작성") post. */
  region: Region | null;
}

export interface FeedResponse {
  posts: FeedPost[];
  pagination: { page: number; limit: number; total: number; hasMore: boolean };
}

/** The public in-app feed of everyone's published 여행 후기 (trip posts), most recent first — optionally filtered by region, a free-text search across the post's title/content/trip title/visited place names, and/or scoped to only people the viewer follows ("트메" tab). */
export async function fetchFeed(
  page = 1,
  limit = 10,
  options?: { region?: Region; q?: string; scope?: "all" | "following" },
): Promise<FeedResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (options?.region) params.set("region", options.region);
  if (options?.q?.trim()) params.set("q", options.q.trim());
  if (options?.scope === "following") params.set("scope", "following");
  const res = await fetch(`/api/feed?${params.toString()}`);
  if (!res.ok) return { posts: [], pagination: { page, limit, total: 0, hasMore: false } };
  return res.json();
}

export interface TripPostPlaceReview {
  placeId: string;
  placeName: string;
  rating: number;
  content: string;
  images: string[];
}

export interface TripPostDetail extends FeedPost {
  visibility: Visibility;
  /** Only populated for the owner when visibility is "custom". */
  visibleToUserIds: number[];
  /** null for a plan-less ("완전 새로 작성") post. */
  itineraryId: number | null;
  likesCount: number;
  /** Whether the current viewer has liked this post — always false when signed out. */
  isLiked: boolean;
}

/** A single trip post with author/trip context and its author's per-place ratings for the same trip (embedded "다녀온 장소" section) — null if it doesn't exist or isn't visible to the current viewer. */
export async function fetchTripPost(id: number): Promise<{ post: TripPostDetail; placeReviews: TripPostPlaceReview[]; isOwner: boolean } | null> {
  const res = await fetch(`/api/trip-posts/${id}`);
  if (!res.ok) return null;
  return res.json();
}

export async function likeTripPost(id: number): Promise<void> {
  const res = await fetch(`/api/trip-posts/${id}/like`, { method: "POST" });
  if (!res.ok) throw new Error("좋아요를 처리하지 못했어요");
}

export async function unlikeTripPost(id: number): Promise<void> {
  const res = await fetch(`/api/trip-posts/${id}/like`, { method: "DELETE" });
  if (!res.ok) throw new Error("좋아요를 처리하지 못했어요");
}

// ─────────────────────────────────────────────────────────────
// 팔로우 — "트메공개"(맞팔로우)와 "특정인공개"(내 팔로워 중 선택)의 기반이
// 되는 단방향 팔로우 관계. "트메 신청"은 상대가 수락해야 실제 관계로
// 카운트되고, "트메" 판정은 양방향(맞팔로우)이 모두 수락 상태여야 한다.
// "팔로잉"과 "친구"(맞팔로우)는 이 앱에서 통틀어 "트래블메이트(트메)"라고
// 부른다 — UI 문구만 그렇고, 내부 필드명(isFriend 등)은 의미를 그대로 유지한다.

export interface FollowUser {
  id: number;
  name: string | null;
  image: string | null;
}

export interface FollowStatus {
  /** I follow them (수락됨). */
  isFollowing: boolean;
  /** They follow me (수락됨). */
  isFollowedBy: boolean;
  /** Both directions — what "트메공개" gates on. */
  isFriend: boolean;
  /** I've sent them a 트메 신청 that they haven't responded to yet. */
  isPendingOutgoing: boolean;
  /** They've sent me a 트메 신청 I haven't responded to yet. */
  isPendingIncoming: boolean;
  followerCount: number;
  followingCount: number;
}

const EMPTY_FOLLOW_STATUS: FollowStatus = {
  isFollowing: false,
  isFollowedBy: false,
  isFriend: false,
  isPendingOutgoing: false,
  isPendingIncoming: false,
  followerCount: 0,
  followingCount: 0,
};

/** Follow status + counts for one target user, relative to the current session. */
export async function fetchFollowStatus(targetUserId: number): Promise<FollowStatus> {
  const res = await fetch(`/api/follows?targetUserId=${targetUserId}`);
  if (!res.ok) return EMPTY_FOLLOW_STATUS;
  return res.json();
}

/** Just the current session's own 트래블 메이트 count — a single-query fast path (see /api/follows `list=count`) for UI that only needs the number, not the full status/list payloads. */
export async function fetchMateCount(): Promise<number> {
  const res = await fetch("/api/follows?list=count");
  if (!res.ok) return 0;
  const data = (await res.json()) as { count: number };
  return data.count;
}

/** 실패를 조용히 삼키지 않도록 — 세션 만료(401) 등으로 실패했는데도 버튼만
 * 아무 반응 없이 끝나 보이는 문제를 막는다. 서버가 주는 원문 에러는 영문
 * 코드라 그대로 보여주지 않고, 상황별 한국어 메시지로 치환한다. */
async function assertFollowsOk(res: Response, fallback: string): Promise<void> {
  if (res.ok) return;
  if (res.status === 401) throw new Error("로그인이 만료됐어요 — 다시 로그인해주세요");
  if (res.status === 429) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? fallback);
  }
  throw new Error(fallback);
}

/** Sends a 트메 신청 — needs the recipient's acceptance before it counts as a real connection. */
export async function followUser(targetUserId: number): Promise<void> {
  const res = await fetch("/api/follows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUserId }),
  });
  await assertFollowsOk(res, "트래블 메이트 신청을 보내지 못했어요");
}

/** Cancels my own pending 트메 신청 to `targetUserId`, or ends an already-accepted connection. */
export async function unfollowUser(targetUserId: number): Promise<void> {
  const res = await fetch(`/api/follows?targetUserId=${targetUserId}`, { method: "DELETE" });
  await assertFollowsOk(res, "요청을 처리하지 못했어요");
}

/** Accepts a pending 트메 신청 sent to me by `requesterId`. */
export async function acceptFollowRequest(requesterId: number): Promise<void> {
  const res = await fetch("/api/follows", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requesterId }),
  });
  await assertFollowsOk(res, "수락하지 못했어요");
}

/** Rejects a pending 트메 신청 sent to me by `requesterId`. */
export async function rejectFollowRequest(requesterId: number): Promise<void> {
  const res = await fetch(`/api/follows?requesterId=${requesterId}`, { method: "DELETE" });
  await assertFollowsOk(res, "거절하지 못했어요");
}

/** The current user's own follow-related lists — followers/following은 수락된 관계, received/sent는 대기 중인 트메 신청(받은 것/보낸 것). */
export async function fetchFollowList(list: "followers" | "following" | "received" | "sent"): Promise<FollowUser[]> {
  const res = await fetch(`/api/follows?list=${list}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { users?: FollowUser[] };
  return data.users ?? [];
}

export interface UserProfile {
  id: number;
  nickname: string | null;
  image: string | null;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isFriend: boolean;
  isPendingOutgoing: boolean;
  isPendingIncoming: boolean;
}

/** Public profile snapshot for any user (nickname/avatar + follower/트메 수 + 뷰어의 팔로우 상태) — powers the profile popup opened by tapping a nickname anywhere in the app. */
export async function fetchUserProfile(userId: number): Promise<UserProfile | null> {
  const res = await fetch(`/api/users/${userId}`);
  if (!res.ok) return null;
  return res.json();
}

// ─────────────────────────────────────────────────────────────
// 알림 — 앱 우측 상단 벨 아이콘. 누가 나에게 트메를 신청하거나(수락/거절
// 필요), 신청을 수락하거나, 내 후기에 좋아요를 누르면 한 건씩 쌓인다.

export interface AppNotification {
  id: number;
  type: "follow_request" | "follow_accept" | "like";
  actorId: number;
  actorName: string | null;
  actorImage: string | null;
  /** "like" 알림에만 있음 — 눌러서 바로 그 후기로 이동할 때 쓴다. */
  postId: number | null;
  postTitle: string | null;
  /** "follow_request" 알림에만 있음 — 'pending'이면 수락/거절 버튼을 보여준다, 이미 처리됐거나(수락/취소/거절) 지난 신청이면 'accepted'|'none'. */
  requestStatus: "pending" | "accepted" | "none" | null;
  read: boolean;
  createdAt: string;
}

export async function fetchNotifications(): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  const res = await fetch("/api/notifications");
  if (!res.ok) return { notifications: [], unreadCount: 0 };
  return res.json();
}

/** Marks every notification the current user has as read — called when the bell panel opens. */
export async function markNotificationsRead(): Promise<void> {
  await fetch("/api/notifications", { method: "PATCH" });
}

// ─────────────────────────────────────────────────────────────
// 다이렉트 메시지 — 서로 트래블 메이트인 사람끼리만 보낼 수 있다.

export interface Conversation {
  userId: number;
  nickname: string | null;
  image: string | null;
  lastMessage: string;
  lastMessageDeleted: boolean;
  lastSenderId: number;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ChatMessage {
  id: number;
  senderId: number;
  recipientId: number;
  content: string;
  createdAt: string;
  read: boolean;
  deleted: boolean;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch("/api/messages");
  if (!res.ok) return [];
  const data = (await res.json()) as { conversations: Conversation[] };
  return data.conversations;
}

/** Loads (and marks read) the message thread with one specific 트래블 메이트. */
export async function fetchThread(userId: number): Promise<ChatMessage[]> {
  const res = await fetch(`/api/messages/${userId}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { messages: ChatMessage[] };
  return data.messages;
}

export async function sendMessage(recipientId: number, content: string): Promise<ChatMessage> {
  const res = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipientId, content }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "메시지를 보내지 못했어요");
  }
  const data = (await res.json()) as { message: ChatMessage };
  return data.message;
}

/** 내가 보낸 메시지를 삭제한다 — 성공하면 대화 양쪽 모두에서 "삭제된 메시지"로 보인다. */
export async function deleteMessage(otherId: number, messageId: number): Promise<void> {
  const res = await fetch(`/api/messages/${otherId}?messageId=${messageId}`, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "메시지를 삭제하지 못했어요");
  }
}

export interface DiscoverBrowseResponse {
  bundle: DiscoverBundle;
  regionTree: RegionNode[];
  season: Season;
  /** Set when a fully-drilled-down 지역별 selection had nothing, and the bundle fell back to scope-wide popular spots instead. */
  notice: "coming_soon" | null;
}

/**
 * Browse feed for /discover — branches by scope + category (계절별/최근
 * 핫한/지역별). `path` is the 지역별 drill-down so far, most-general
 * first: [continent, country, city] overseas, [region, neighborhood]
 * domestic (see regionHierarchy/matchesRegionPath in discoverData.ts).
 */
export async function fetchDiscoverBundle(
  scope: DiscoverScope,
  category: string,
  path: string[],
  /** 계절/핫한 check-filters — combinable with each other and with a region path. */
  checks?: { season?: boolean; hot?: boolean },
): Promise<DiscoverBrowseResponse> {
  const params = new URLSearchParams({ scope, category });
  if (path.length > 0) params.set("path", path.join(","));
  if (checks?.season) params.set("season", "1");
  if (checks?.hot) params.set("hot", "1");
  const res = await fetch(`/api/discover/trends?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load discover feed");
  return res.json();
}

export interface DiscoverSearchPagination {
  page: number;
  limit: number;
  /** Total matching spots (post category/cuisine filter, pre-pagination) — drives the page-number UI. */
  total: number;
  hasMore: boolean;
  /** Mocked for shape-compatibility with a real Places API paged response — not currently decoded, paging is driven by `page` directly. */
  nextPageToken: string | null;
}

export interface DiscoverSearchResponse {
  /** `spots` is just the current page (<= limit items) — routes are small enough to stay unpaginated. */
  results: { spots: DiscoverSpot[]; routes: DiscoverRoute[] };
  /** Category implied by an intent keyword or dish name in the query (e.g. "밥집"/"라멘" -> 음식점), for auto-activating the results' filter chip. Null if the query had no recognizable intent. */
  intentTag: PlaceCategoryTag | null;
  /** The category actually applied server-side: an explicit `tag` override, else `intentTag`, else "all". */
  appliedCategory: PlaceCategoryTag | "all";
  pagination: DiscoverSearchPagination;
}

export interface DiscoverSearchOptions {
  /** Explicit category chip override — omit to let the server fall back to the query's detected intent. */
  tag?: PlaceCategoryTag | "all";
  /** 음식점 sub-filter — only meaningful when tag (or the detected intent) is 음식점. */
  cuisine?: CuisineTag | "all";
  page?: number;
  limit?: number;
}

/** Free-text, server-side-paginated search across /discover's spots + routes for the given scope. */
export async function fetchDiscoverSearch(
  scope: DiscoverScope,
  query: string,
  options: DiscoverSearchOptions = {},
): Promise<DiscoverSearchResponse> {
  const params = new URLSearchParams({ scope, q: query });
  if (options.tag && options.tag !== "all") params.set("tag", options.tag);
  if (options.cuisine && options.cuisine !== "all") params.set("cuisine", options.cuisine);
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  const res = await fetch(`/api/discover/trends?${params.toString()}`);
  if (!res.ok) throw new Error("Discover search failed");
  return res.json();
}

export type ReportTargetType = "trip_post" | "message" | "user";
export type ReportReason = "spam" | "abuse" | "sexual" | "illegal" | "other";

export interface Report {
  id: number;
  reporterId: number | null;
  reporterNickname: string | null;
  reportedUserId: number | null;
  reportedNickname: string | null;
  targetType: string;
  targetId: number;
  reason: string;
  detail: string;
  status: string;
  adminNote: string;
  createdAt: string;
}

/** 여행 후기·메시지·사용자 프로필을 관리자에게 신고한다. */
export async function submitReport(input: { targetType: ReportTargetType; targetId: number; reason: ReportReason; detail?: string }): Promise<void> {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "신고를 접수하지 못했어요");
  }
}

/** 관리자 전용 — 전체 신고 목록. */
export async function fetchReports(): Promise<Report[]> {
  const res = await fetch("/api/reports");
  if (!res.ok) return [];
  const data = (await res.json()) as { reports: Report[] };
  return data.reports;
}

/** 관리자 전용 — 신고 처리 상태/메모 갱신. */
export async function updateReport(id: number, input: { status?: string; adminNote?: string }): Promise<void> {
  const res = await fetch(`/api/reports/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("신고 처리 갱신에 실패했어요");
}

/** 관리자 전용 — 사용자 정지/정지 해제. */
export async function setUserBanned(userId: number, isBanned: boolean): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isBanned }),
  });
  if (!res.ok) throw new Error("계정 상태 변경에 실패했어요");
}

export interface AdminStats {
  totalUsers: number;
  newUsers: { today: number; last7: number; last30: number };
  activeUsers: { last1: number; last7: number; last30: number };
  signupTrend: { date: string; count: number }[];
  engagement: {
    savedPlans: number;
    tripPosts: number;
    reviews: number;
    messages: number;
    mateConnections: number;
  };
  recentSignups: { id: number; name: string; image: string | null; createdAt: string }[];
}

/** 관리자 전용 — 가입 추이·활성 사용자·이용량 대시보드 데이터. */
export async function fetchAdminStats(): Promise<AdminStats | null> {
  const res = await fetch("/api/admin/stats");
  if (!res.ok) return null;
  return (await res.json()) as AdminStats;
}

export interface AdminUserRow {
  id: number;
  name: string;
  email: string | null;
  image: string | null;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: string;
}

/** 루트 관리자 전용 — 닉네임으로 사용자 검색(관리자 지정/해제 화면). */
export async function fetchAdminUsers(query: string): Promise<AdminUserRow[]> {
  const res = await fetch(`/api/admin/users?query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { users: AdminUserRow[] };
  return data.users;
}

/** 루트 관리자 전용 — 관리자 권한 부여/회수. */
export async function setUserAdmin(userId: number, isAdmin: boolean): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isAdmin }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "관리자 권한 변경에 실패했어요");
  }
}
