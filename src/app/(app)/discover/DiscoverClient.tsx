"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Flame,
  Crown,
  Map as MapIcon,
  Plus,
  MapPin,
  Clock,
  Coffee,
  Landmark,
  UtensilsCrossed,
  Camera,
  Waves,
  Tent,
  Wine,
  Building2,
  ShoppingBag,
  Hotel,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  CalendarRange,
  Heart,
  Eye,
  ExternalLink,
  X,
  Leaf,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { ScheduleModal } from "@/components/ScheduleModal";
import { PlaceDetailOverlay } from "@/app/(app)/planner/PlaceDetailOverlay";
import { MonthCalendar } from "@/components/MonthCalendar";
import { MapProvider } from "@/app/(app)/planner/MapProvider";
import { PlacePager } from "@/components/PlacePager";
import { FolderChips } from "@/components/FolderChips";
import { SchedulePlanPickerModal, type SchedulePlanTarget } from "@/components/SchedulePlanPickerModal";
import { useItineraryStore, MAX_SAVED_PLANS } from "@/store/itineraryStore";
import { isDomesticCoordinate } from "@/lib/maps/regionForCoords";
import { fetchDiscoverBundle, fetchDiscoverSearch, fetchLivePlaceSearch, fetchSpotMetrics, type SpotMetrics } from "@/lib/api";
import { useUserLocation } from "@/lib/useUserLocation";
import { LIVE_SORTS, sortPlaces, type LiveSortKey } from "@/lib/placeSort";
import { formatDateLabelShort, hourFromTime, pad2, todayISODate, TIMELINE_HOURS } from "@/lib/timeline";
import { SEASON_LABEL, isPlaceholderSpot } from "@/lib/discoverData";
import { colorForId } from "@/lib/placeStyle";
import { useRecentSearches } from "@/lib/useRecentSearches";
import { useBackButtonClose } from "@/lib/useBackButtonClose";
import type {
  CuisineTag,
  DiscoverRoute,
  DiscoverRouteStop,
  DiscoverScope,
  DiscoverSpot,
  PlaceCategoryTag,
  RegionNode,
  SpotIconKey,
} from "@/lib/discoverData";
import type { Place, PlaceIcon, Region } from "@/lib/types";
import { bookingProviders, isLodging, hasAffiliateLink } from "@/lib/affiliates";

// Always client-only — see RoutePreviewMap.tsx / lib/maps/mapResize.ts.
const RoutePreviewMap = dynamic(() => import("./RoutePreviewMap"), { ssr: false });
const LiveResultsMap = dynamic(() => import("./LiveResultsMap"), { ssr: false });

type SectionKind = "trending" | "favorites" | "lodging" | "routes";
// "인기 숙소" 섹션 임시 비활성화 — 국내 89.6%/해외 83.1%가 실존 확인 안 된
// 템플릿 생성 스팟(GitHub #164)이라, 순위(1~4위)만 떼도 나머지가 실존
// 주장은 그대로 남는다. 예약 의도가 실린 카테고리라 다른 카드보다 결과가
// 무거워 #164 결론(삭제 vs API 기반 교체) 날 때까지 섹션 자체를 숨긴다 —
// lodgingSpots/lodgingRanked 등 계산 로직은 그대로 두고 렌더만 끈다.
const HIDE_LODGING_SECTION = true;
const COMPACT_SPOT_COUNT = 4;
/** How many of the top-ranked candidates the compact preview draws its random pick from — keeps the shown spots genuinely popular while still varying which ones surface each visit. */
const COMPACT_POOL_SIZE = 10;
const COMPACT_ROUTE_COUNT = 2;

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const SCOPES: { key: DiscoverScope; label: string; flag: string }[] = [
  { key: "domestic", label: "국내 여행", flag: "🇰🇷" },
  { key: "overseas", label: "해외 여행", flag: "🌐" },
];


/** Search results' "카테고리별 장소" sub-filter chips — a coarser subset of PlaceCategoryTag focused on trip-planning essentials (맛집/숙소 pickup), not every tag the data model supports. */
type SpotCategoryFilter = "all" | PlaceCategoryTag;
const SEARCH_CATEGORY_FILTERS: { key: SpotCategoryFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "관광지", label: "관광지" },
  { key: "테마파크", label: "테마파크" },
  { key: "음식점", label: "음식점" },
  { key: "술집", label: "술집" },
  { key: "카페", label: "카페" },
  { key: "숙소", label: "숙소" },
];

/** Second-row sub-filter, shown only once 음식점 is the active category. */
type CuisineFilter = "all" | CuisineTag;
const CUISINE_FILTERS: { key: CuisineFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "일식", label: "일식" },
  { key: "한식", label: "한식" },
  { key: "양식/아시안", label: "양식/아시안" },
  { key: "카페/디저트", label: "카페/디저트" },
];

const SEARCH_PAGE_LIMIT = 10;
/** 실시간 검색 결과(그 외 종합 결과) 섹션의 클라이언트 페이지당 개수 — 서버가 최대 ~60개까지 한 번에 가져와두고 여기서 정렬 후 잘라 보여준다. */
const LIVE_RESULT_PAGE_SIZE = 12;

/** Google `primaryType` -> Korean badge label for live result cards; unmapped types fall back to the raw type with underscores spaced. */
const LIVE_TYPE_LABELS: Record<string, string> = {
  restaurant: "음식점",
  japanese_restaurant: "일식",
  sushi_restaurant: "스시",
  ramen_restaurant: "라멘",
  yakiniku_restaurant: "야키니쿠",
  tonkatsu_restaurant: "돈카츠",
  korean_restaurant: "한식",
  chinese_restaurant: "중식",
  italian_restaurant: "양식",
  french_restaurant: "양식",
  seafood_restaurant: "해산물",
  barbecue_restaurant: "바비큐",
  fast_food_restaurant: "패스트푸드",
  cafe: "카페",
  coffee_shop: "카페",
  bakery: "베이커리",
  dessert_shop: "디저트",
  bar: "술집",
  izakaya_restaurant: "이자카야",
  hotel: "호텔",
  lodging: "숙소",
  tourist_attraction: "관광지",
  shopping_mall: "쇼핑",
  market: "시장",
  park: "공원",
  museum: "박물관",
};
const liveTypeLabel = (category: string) => LIVE_TYPE_LABELS[category] ?? category.replace(/_/g, " ");

/** "그 외 종합 결과" 테마 그룹 — 관광지/테마파크/음식점/술집/카페/숙소 순서로 묶어
 * 보여주고, 어느 카테고리에도 안 걸리는 결과는 기타로 모은다. */
type LiveBucketKey = "관광지" | "테마파크" | "음식점" | "술집" | "카페" | "숙소" | "기타";
const LIVE_BUCKET_GROUPS: { key: LiveBucketKey; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: "관광지", label: "관광지", icon: Landmark },
  { key: "테마파크", label: "테마파크", icon: Tent },
  { key: "음식점", label: "음식점", icon: UtensilsCrossed },
  { key: "술집", label: "술집", icon: Wine },
  { key: "카페", label: "카페", icon: Coffee },
  { key: "숙소", label: "숙소", icon: Hotel },
  { key: "기타", label: "기타", icon: MapPin },
];
/** Google `primaryType`(영문) / Kakao `category_group_name`(국문) 원시 카테고리
 * 문자열을 위 6+1개 테마 버킷으로 매핑한다. 정확히 일치하는 값이 없으면
 * 키워드 휴리스틱으로 한 번 더 시도하고, 그래도 안 걸리면 기타로 보낸다. */
const LIVE_BUCKET_BY_TYPE: Record<string, LiveBucketKey> = {
  amusement_park: "테마파크",
  water_park: "테마파크",
  theme_park: "테마파크",
  aquarium: "테마파크",
  zoo: "테마파크",
  restaurant: "음식점",
  japanese_restaurant: "음식점",
  sushi_restaurant: "음식점",
  ramen_restaurant: "음식점",
  yakiniku_restaurant: "음식점",
  tonkatsu_restaurant: "음식점",
  korean_restaurant: "음식점",
  chinese_restaurant: "음식점",
  italian_restaurant: "음식점",
  french_restaurant: "음식점",
  seafood_restaurant: "음식점",
  barbecue_restaurant: "음식점",
  fast_food_restaurant: "음식점",
  izakaya_restaurant: "술집",
  bar: "술집",
  pub: "술집",
  night_club: "술집",
  cafe: "카페",
  coffee_shop: "카페",
  bakery: "카페",
  dessert_shop: "카페",
  hotel: "숙소",
  lodging: "숙소",
  resort_hotel: "숙소",
  motel: "숙소",
  tourist_attraction: "관광지",
  shopping_mall: "관광지",
  market: "관광지",
  park: "관광지",
  museum: "관광지",
  art_gallery: "관광지",
  관광명소: "관광지",
  문화시설: "관광지",
  공원: "관광지",
  숙박: "숙소",
  음식점: "음식점",
  카페: "카페",
};
function liveCategoryBucket(category: string): LiveBucketKey {
  const mapped = LIVE_BUCKET_BY_TYPE[category];
  if (mapped) return mapped;
  if (/술집|호프|이자카야|포차|와인바|맥주|pub|bar/i.test(category)) return "술집";
  if (/카페|디저트|베이커리|cafe|coffee|dessert|bakery/i.test(category)) return "카페";
  if (/테마파크|놀이공원|워터파크|아쿠아리움|동물원|amusement|theme_park|water_park|aquarium|zoo/i.test(category)) return "테마파크";
  if (/숙박|호텔|모텔|hotel|lodging|motel|resort/i.test(category)) return "숙소";
  if (/음식|식당|맛집|restaurant|food/i.test(category)) return "음식점";
  if (/관광|박물관|미술관|공원|명소|시장|쇼핑|tourist|museum|park|market|mall|gallery/i.test(category)) return "관광지";
  return "기타";
}

const SPOT_ICONS: Record<SpotIconKey, React.ComponentType<{ size?: number; className?: string }>> = {
  coffee: Coffee,
  camera: Camera,
  waves: Waves,
  landmark: Landmark,
  utensils: UtensilsCrossed,
  pin: MapPin,
  tent: Tent,
  wine: Wine,
  building: Building2,
  hotel: Hotel,
};

const CATEGORY_ICONS: Record<PlaceCategoryTag, React.ComponentType<{ size?: number; className?: string }>> = {
  관광지: Landmark,
  테마파크: Tent,
  음식점: UtensilsCrossed,
  술집: Wine,
  박물관: Building2,
  카페: Coffee,
  자연: Waves,
  쇼핑: ShoppingBag,
  숙소: MapPin,
};

// Maps this page's curated iconKey/tag strings onto the store's PlaceIcon
// string enum (src/lib/types.ts) — the closest semantic match for each,
// since the two aren't the same set of icons.
const SPOT_ICON_TO_PLACE_ICON: Record<SpotIconKey, PlaceIcon> = {
  coffee: "coffee",
  camera: "camera",
  waves: "boat",
  landmark: "museum",
  utensils: "utensils",
  pin: "pin",
  tent: "pin",
  wine: "utensils",
  building: "museum",
  hotel: "pin",
};

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** A spot's `region` is "국가 · 도시" (overseas) or "시도 · 동네" (domestic) — the city-ish label for the /planner header is the second segment overseas, the first domestic. */
function cityFromRegion(region: string, scope: DiscoverScope): string {
  const parts = region.split(" · ");
  return (scope === "overseas" ? parts[1] : parts[0]) ?? parts[0] ?? region;
}

function spotToPlace(spot: DiscoverSpot): Place {
  return {
    id: spot.id,
    placeId: spot.id,
    name: spot.name,
    category: spot.tag,
    color: spot.color,
    lat: spot.lat,
    lng: spot.lng,
    icon: SPOT_ICON_TO_PLACE_ICON[spot.iconKey] ?? "pin",
  };
}

function routeStopToPlace(routeId: string, stop: DiscoverRouteStop): Place {
  const slug = stop.name.replace(/[^a-zA-Z0-9가-힣]+/g, "-");
  const id = `${routeId}-${slug}`;
  return { id, placeId: id, name: stop.name, category: "루트 경유지", color: colorForId(id), lat: stop.lat, lng: stop.lng, icon: "pin" };
}

/** The drill-down options one level below wherever `path` currently points. */
function nodesAtPath(tree: RegionNode[], path: string[]): RegionNode[] {
  let level = tree;
  for (const label of path) {
    const found = level.find((n) => n.label === label);
    if (!found) return [];
    level = found.children;
  }
  return level;
}

/** 대륙→국가→도시 (해외) / 광역→시군→동 (국내) 지역 좁히기 chips — 메인 브라우즈 화면과 "전체보기"(ExpandedSection) 양쪽에서 같은 regionPath 상태를 공유해 쓴다. */
function RegionDrilldown({
  regionPath,
  regionOptions,
  onSetPath,
}: {
  regionPath: string[];
  regionOptions: RegionNode[];
  onSetPath: (path: string[]) => void;
}) {
  if (regionPath.length === 0 && regionOptions.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      {regionPath.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <button onClick={() => onSetPath([])} className="rounded-full bg-slate-100 px-3 py-1 text-[11.5px] font-medium text-slate-500 hover:bg-slate-200">
            전체
          </button>
          {regionPath.map((label, i) => (
            <button
              key={label}
              onClick={() => onSetPath(regionPath.slice(0, i + 1))}
              className="flex items-center gap-0.5 rounded-full bg-indigo-600 px-3 py-1 text-[11.5px] font-semibold text-white"
            >
              {label}
              {i < regionPath.length - 1 && <ChevronRight size={11} />}
            </button>
          ))}
        </div>
      )}
      {regionOptions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {regionOptions.map((node) => (
            <button
              key={node.label}
              onClick={() => onSetPath([...regionPath, node.label])}
              className="rounded-full bg-slate-100 px-3 py-1 text-[11.5px] font-medium text-slate-500 hover:bg-slate-200"
            >
              {node.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 큐레이션 스팟(SpotCard)의 실제 Google 지표 — DiscoverPage가 마운트 시
// 한 번만 불러 여기 채우고, SpotCard는 spot.id로 조회만 한다. props로
// 6곳의 <SpotCard> 호출부(중첩된 섹션 컴포넌트들 포함)까지 꿰뚫어
// 전달하는 대신 Context로 두면 그 호출부들은 안 건드려도 된다. 값이
// 없는 spot.id는 키가 아예 없다 — placeId 미확정/편집 개념 카드/아직
// 갱신 배치가 안 돈 스팟.
const SpotMetricsContext = createContext<Record<string, SpotMetrics>>({});

// ─────────────────────────────────────────────────────────────
// The global App Bar (hamburger + title + Sheet nav) already lives in
// src/components/AppBar.tsx, rendered once by src/app/(app)/layout.tsx
// above every screen in this group — this page owns only the content
// below it, not another header.
export function DiscoverPage() {
  const router = useRouter();
  const addPlaces = useItineraryStore((s) => s.addPlaces);
  const addItem = useItineraryStore((s) => s.addItem);
  const isHourTaken = useItineraryStore((s) => s.isHourTaken);
  const hasConflict = useItineraryStore((s) => s.hasConflict);
  const setCurrentCity = useItineraryStore((s) => s.setCurrentCity);
  const upsertSavedPlace = useItineraryStore((s) => s.upsertSavedPlace);
  const setRegion = useItineraryStore((s) => s.setRegion);
  const items = useItineraryStore((s) => s.items);
  const savedPlans = useItineraryStore((s) => s.savedPlans);
  const activePlanId = useItineraryStore((s) => s.activePlanId);
  const loadPlan = useItineraryStore((s) => s.loadPlan);
  const savePlanAs = useItineraryStore((s) => s.savePlanAs);
  const clearAllItems = useItineraryStore((s) => s.clearAllItems);

  const [scope, setScope] = useState<DiscoverScope>("domestic");
  // 계절/핫한 are combinable check-filters; 지역별 opens the drill-down and
  // its path stacks with both checks (e.g. 경상북도>경주 + 🍂계절 + 🔥핫한).
  const [seasonCheck, setSeasonCheck] = useState(false);
  const [hotCheck, setHotCheck] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [regionPath, setRegionPath] = useState<string[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [scheduleSpot, setScheduleSpot] = useState<Place | null>(null);
  // Place waiting on "어떤 계획에 추가할까요?" before its ScheduleModal opens —
  // same picker PlannerBoard uses, only shown when there's an actual choice
  // (see requestSchedule below).
  const [schedulePickerPlace, setSchedulePickerPlace] = useState<Place | null>(null);
  // Set by the "+" quick-add button — asks whether the tapped place should
  // go to 일정 or 관심 장소 instead of assuming one or the other.
  const [addChoiceTarget, setAddChoiceTarget] = useState<{ place: Place; city: string } | null>(null);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  // The overlay opens via local state, not a route change — without this,
  // the Android back button skips past it (and the search results
  // underneath) straight to whatever page was open before /discover.
  useBackButtonClose(detailPlace !== null, () => setDetailPlace(null));
  const [routeTarget, setRouteTarget] = useState<DiscoverRoute | null>(null);
  const [previewRoute, setPreviewRoute] = useState<DiscoverRoute | null>(null);
  const [expandedSection, setExpandedSection] = useState<SectionKind | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { recent: recentSearches, addRecent, clearRecent } = useRecentSearches();

  // ── restore a previous search from the URL (?scope=&q=) ──
  // Coming back from /planner (or a full reload) used to dump the user on
  // an empty search box, forcing a retype + a fresh round of API calls.
  // runSearch/clearSearch below keep the URL in sync via replaceState, so
  // browser-back and reloads land right back on the same results.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlScope = params.get("scope");
    const urlQuery = params.get("q");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the URL (an external system) on first mount, same pattern as useRecentSearches
    if (urlScope === "domestic" || urlScope === "overseas") setScope(urlScope);
    if (urlQuery) {
      setQueryInput(urlQuery);
      setActiveQuery(urlQuery);
    }
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  // ── browse feed: scope + combinable filters (지역 path × 계절 × 핫한) ──
  const {
    data: browseData,
    isFetching: browseFetching,
    dataUpdatedAt: browseUpdatedAt,
  } = useQuery({
    queryKey: ["discover-trends", scope, seasonCheck, hotCheck, regionPath],
    queryFn: () => fetchDiscoverBundle(scope, regionPath.length > 0 ? "region" : "all", regionPath, { season: seasonCheck, hot: hotCheck }),
    enabled: activeQuery.trim().length === 0,
  });


  // 큐레이션 스팟의 실제 Google 지표 — scope/필터와 무관하게 딱 한 번만
  // 불러서 SpotMetricsContext로 흘려보낸다. 월 1회 배치로만 갱신되는
  // 데이터라 staleTime을 길게 잡아 세션 안에서 재요청하지 않는다.
  const { data: spotMetrics } = useQuery({
    queryKey: ["discover-spot-metrics"],
    queryFn: fetchSpotMetrics,
    staleTime: 60 * 60 * 1000,
  });

  const isSearching = activeQuery.trim().length > 0;
  const bundle = browseData?.bundle;
  const regionTree = browseData?.regionTree ?? [];
  const regionOptions = nodesAtPath(regionTree, regionPath);

  // `scopeOverride` lets a recent-search chip re-run its query under the
  // scope it was originally searched in — replaying "도톤보리 맛집" while
  // the 국내 tab happened to be active used to silently run a domestic
  // Kakao search and come back empty.
  const runSearch = (query: string = queryInput, scopeOverride?: DiscoverScope) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const effectiveScope = scopeOverride ?? scope;
    if (effectiveScope !== scope) setScope(effectiveScope);
    setQueryInput(trimmed);
    setActiveQuery(trimmed);
    addRecent(trimmed, effectiveScope);
    setSearchFocused(false);
    // Display-only URL sync (no new RSC payload needed) — lets browser
    // back/reload restore this exact search instead of a blank box.
    window.history.replaceState(null, "", `/discover?scope=${effectiveScope}&q=${encodeURIComponent(trimmed)}`);
  };
  const clearSearch = () => {
    setQueryInput("");
    setActiveQuery("");
    window.history.replaceState(null, "", "/discover");
  };

  const handleScopeChange = (next: DiscoverScope) => {
    setScope(next);
    setSeasonCheck(false);
    setHotCheck(false);
    setRegionOpen(false);
    setRegionPath([]);
    setExpandedSection(null);
    clearSearch();
  };

  // /planner's header shows whichever city was most recently scheduled/
  // opened from here — replaces what used to be a fixed "Fukuoka × Yufuin".
  // The "+" quick-add button used to always assume "일정에 추가" — ambiguous,
  // since 관심 장소(찜) is just as common an intent. It now opens a tiny
  // choice sheet (below) instead of jumping straight to the schedule modal.
  const handleAddSpot = (spot: DiscoverSpot) => {
    setAddChoiceTarget({ place: spotToPlace(spot), city: cityFromRegion(spot.region, scope) });
  };

  // Tapping the card itself (not the [+] quick-add button) opens the 딥
  // 다이브 detail overlay right here as a popup — it used to router.push
  // over to /planner, which threw away the whole search context and made
  // browser-back re-run everything from scratch.
  const handleOpenDetail = (spot: DiscoverSpot) => {
    setCurrentCity(cityFromRegion(spot.region, scope));
    setDetailPlace(spotToPlace(spot));
  };

  // Live search results (real Google Places / Kakao Local hits, see
  // fetchLivePlaceSearch) already arrive as `Place` objects — no
  // spotToPlace conversion needed, unlike the curated-seed-data path above.
  // There's no clean "region" field to derive a city from, so the search
  // query itself doubles as the header label.
  const handleAddLivePlace = (place: Place) => {
    setAddChoiceTarget({ place, city: activeQuery.trim() });
  };

  const activePlan = savedPlans.find((p) => p.id === activePlanId);
  // Whether switching the working itinerary to a different saved plan right
  // now would drop something un-snapshotted — mirrors PlannerBoard's check.
  const hasUnsavedPlanChanges = activePlanId
    ? JSON.stringify(items) !== JSON.stringify(activePlan?.items ?? [])
    : items.length > 0;

  // Asks which plan a place should be scheduled into when there's an actual
  // choice to make (more than one saved plan) — otherwise goes straight to
  // ScheduleModal, same as before.
  const requestSchedule = (place: Place) => {
    if (savedPlans.length > 0) setSchedulePickerPlace(place);
    else setScheduleSpot(place);
  };

  const handleSchedulePlanPicked = (target: SchedulePlanTarget) => {
    const place = schedulePickerPlace;
    setSchedulePickerPlace(null);
    if (!place) return;
    if (target.type === "existing") {
      const plan = savedPlans.find((p) => p.id === target.planId);
      loadPlan(target.planId);
      if (plan) showToast(`"${plan.name}" 계획으로 전환했어요`);
    } else if (target.type === "new") {
      clearAllItems();
      savePlanAs(target.name);
    }
    setScheduleSpot(place);
  };

  const confirmAddToSchedule = () => {
    if (!addChoiceTarget) return;
    setCurrentCity(addChoiceTarget.city);
    requestSchedule(addChoiceTarget.place);
    setAddChoiceTarget(null);
  };
  // "관심 장소에 추가" now asks which folder before actually saving (see the
  // addChoiceTarget sheet below) instead of always dropping it in 미분류.
  const confirmAddToFavorites = (folderId: string | undefined) => {
    if (!addChoiceTarget) return;
    setRegion(isDomesticCoordinate(addChoiceTarget.place.lat, addChoiceTarget.place.lng) ? "domestic" : "international");
    upsertSavedPlace({ ...addChoiceTarget.place, folderId });
    showToast(`${addChoiceTarget.place.name} 관심 장소에 저장됨`);
    setAddChoiceTarget(null);
    setChoosingFolder(false);
  };

  const handleOpenLiveDetail = (place: Place) => {
    setCurrentCity(activeQuery.trim());
    setDetailPlace(place);
  };

  const handleAddRoute = (route: DiscoverRoute) => {
    setPreviewRoute(null);
    setRouteTarget(route);
  };

  const confirmRouteAdd = (date: string) => {
    if (!routeTarget) return;
    setCurrentCity(routeTarget.region);
    const places = routeTarget.stops.map((stop) => routeStopToPlace(routeTarget.id, stop));
    if (places[0]) setRegion(isDomesticCoordinate(places[0].lat, places[0].lng) ? "domestic" : "international");
    addPlaces(places);
    // Keep each stop's originally-suggested hour, nudging forward to the
    // next free slot on the chosen date if two stops collide — never
    // silently overwrites an hour the user already booked.
    routeTarget.stops.forEach((stop, i) => {
      const place = places[i];
      const desiredHour = hourFromTime(stop.time);
      const hour = TIMELINE_HOURS.find((h) => h >= desiredHour && !isHourTaken(date, h)) ?? TIMELINE_HOURS.find((h) => !isHourTaken(date, h)) ?? desiredHour;
      const minute = Number(stop.time.split(":")[1] ?? 0);
      addItem({
        placeId: place.id,
        name: place.name,
        date,
        time: `${pad2(hour)}:${pad2(minute)}`,
        coordinates: { lat: place.lat, lng: place.lng },
      });
    });
    showToast(`"${routeTarget.title}" 일정에 담았습니다`);
    setRouteTarget(null);
    router.push("/planner");
  };

  // Randomized pick from the top-ranked pool, re-rolled only when the
  // underlying bundle changes (a fresh fetch / filter change) — previously
  // this always sliced the exact same first N items in the exact same
  // order, so the page read identically on every single visit.
  // 숙소는 "명소"가 아니라서 지금 뜨는 장소/꾸준히 사랑받는 명소에서는 빼고,
  // 아래 별도의 "인기 숙소" 섹션으로 모아 보여준다 — 호텔이 관광지 카드들
  // 사이에 섞여 나오면 어색해 보이는 문제(사용자 피드백)를 해결.
  const lodgingSpots = useMemo(
    () => (bundle ? [...bundle.trending, ...bundle.favorites].filter((s) => isLodging(s.tag)) : []),
    [bundle],
  );
  // isPlaceholderSpot 제외: "지금 뜨는 장소"/"꾸준히 사랑받는 명소"는
  // saves 내림차순으로 상위 POOL을 뽑는데, 템플릿 생성 스팟(#164)이
  // 전부 동일한 고정 saves 시드값(2600)을 갖고 있어 국내 트렌딩만 놓고
  // 보면 상위 10곳 전체가 템플릿 — 즉 셔플이 어떻게 나와도 4장 다
  // 존재하지 않는 스팟만 보이는 상태였다(실측: 첨성대 2200이 실존
  // 최고값인데도 템플릿 2600 밑으로 전부 깔림). saves 값을 손보는 대신
  // 애초에 후보 풀에서 제외 — 숙소 섹션을 통째로 숨긴 것과 같은 논리.
  // trending/favoritesReal은 필터링된 "진짜" 전체 목록 — 컴팩트 미리보기
  // 뿐 아니라 섹션 노출 여부/"전체보기" 활성화 조건도 이걸로 판단해야,
  // 템플릿만 있는 지역(#164)에서 카드 없는 빈 섹션 헤더만 뜨는 걸 막는다.
  const trendingReal = useMemo(
    () => (bundle ? bundle.trending.filter((s) => !isLodging(s.tag) && !isPlaceholderSpot(s)) : []),
    [bundle],
  );
  const favoritesReal = useMemo(
    () => (bundle ? bundle.favorites.filter((s) => !isLodging(s.tag) && !isPlaceholderSpot(s)) : []),
    [bundle],
  );
  // 라이브 검색으로 채워진 지역(#164, notice==="live")은 "지금 뜨는
  // 장소"의 4장 랜덤 미리보기 파이프라인을 안 탄다 — 그건 큐레이션
  // 풀이 충분히 클 때(여러 명이 반복 방문해도 매번 다르게 보이도록)
  // 설계된 것이고, 라이브 검색은 애초에 "이 도시 검색 결과 전체"를
  // 보여주는 게 맞는 의미라 무작위로 4개만 남기면 나머지가 사라진
  // 것처럼 보인다. saves가 전부 0(가짜 지표 없음, #163과 같은 원칙)이라
  // 정렬도 의미가 없다 — 서버가 이미 관광지→음식점→카페 순으로 카테고리
  // 묶어 보낸 순서를 그대로 쓴다.
  const isLiveRegion = browseData?.notice === "live";
  const trendingCompact = useMemo(
    () =>
      isLiveRegion
        ? trendingReal
        : shuffled([...trendingReal].sort((a, b) => b.saves - a.saves).slice(0, COMPACT_POOL_SIZE)).slice(0, COMPACT_SPOT_COUNT),
    [trendingReal, isLiveRegion],
  );
  const favoritesCompact = useMemo(
    () =>
      shuffled(
        [...favoritesReal].sort((a, b) => b.saves - a.saves).slice(0, COMPACT_POOL_SIZE),
      ).slice(0, COMPACT_SPOT_COUNT),
    [favoritesReal],
  );
  // 트렌딩/즐겨찾기와 달리 숙소는 매번 랜덤으로 섞이면 안 된다 — "어디로 갈지
  // 정해놓고 그 지역 인기 숙소 순위를 보러 오는" 용도라, 지역별 칩으로 좁힌
  // 뒤에도 매번 다른 순서로 보이면 "1위가 뭐였지"를 놓치게 된다. saves(담은
  // 수) 내림차순 고정 랭킹으로 보여준다.
  const lodgingRanked = useMemo(() => [...lodgingSpots].sort((a, b) => b.saves - a.saves), [lodgingSpots]);
  const lodgingCompact = useMemo(() => lodgingRanked.slice(0, COMPACT_SPOT_COUNT), [lodgingRanked]);
  const routesCompact = bundle?.routes.slice(0, COMPACT_ROUTE_COUNT) ?? [];

  // 임시 진단 로그 — #164 라이브 검색 결과가 프리뷰에서 간헐적으로
  // 이전 지역 콘텐츠에 멈춰 있던 문제(3차 검증에서 AnimatePresence
  // mode="wait" 제거로 조치, 아직 라이브 미확인) 재검증용. API
  // 응답(browseData)과 실제 렌더에 쓰이는 파생값(trendingCompact 등)을
  // 나란히 찍어서, 응답은 새 지역인데 파생값이 옛 지역에 멈춰 있는지를
  // 한눈에 비교할 수 있게 했다. 이전엔 콘솔이 객체를 축약 표시해
  // 내용을 못 읽는다는 피드백이 있어 JSON.stringify로 바꿈 — 원인
  // 확정되면 제거할 것.
  useEffect(() => {
    console.log(
      "[discover-debug] " +
        JSON.stringify({
          regionPath: regionPath.join("/"),
          isFetching: browseFetching,
          updatedAt: browseUpdatedAt ? new Date(browseUpdatedAt).toISOString() : null,
          notice: browseData?.notice,
          isLiveRegion,
          bundleTrendingLen: browseData?.bundle.trending.length,
          bundleFirstName: browseData?.bundle.trending[0]?.name,
          trendingRealLen: trendingReal.length,
          trendingCompactLen: trendingCompact.length,
          trendingCompactFirstName: trendingCompact[0]?.name,
        }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 진단용, 렌더에 실제 쓰이는 파생값이 바뀔 때마다만 찍히면 충분
  }, [browseData, browseFetching, regionPath, trendingCompact]);

  return (
    <SpotMetricsContext.Provider value={spotMetrics ?? {}}>
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        {/* ── SEARCH + SEGMENTED TOGGLE ── */}
        <section className="mb-8">
          <div className="relative">
            <CordixIcon name="search" size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              // Delayed so a click on a recent-search item (below) still
              // registers before the dropdown unmounts on blur.
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              placeholder="어디로 떠나세요?"
              className="h-14 rounded-2xl border-slate-200 bg-white pl-12 pr-20 text-base shadow-sm shadow-slate-200/60 transition-shadow focus-visible:ring-2 focus-visible:ring-indigo-400 sm:pr-24"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {isSearching && (
                <button
                  onClick={clearSearch}
                  aria-label="검색어 지우기"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
              <Button
                onClick={() => runSearch()}
                disabled={!queryInput.trim()}
                aria-label="검색"
                className="h-10 rounded-xl bg-indigo-600 px-3 text-[13px] font-semibold hover:bg-indigo-700 sm:px-4"
              >
                <CordixIcon name="search" size={15} className="sm:hidden" />
                <span className="hidden sm:inline">검색</span>
              </Button>
            </div>

            {/* 최근 검색어 — 검색창 포커스 시 최대 5개, localStorage 기반 */}
            {searchFocused && recentSearches.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                <div className="mb-1 flex items-center justify-between px-2 pt-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">최근 검색어</span>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={clearRecent}
                    className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
                  >
                    전체 삭제
                  </button>
                </div>
                {recentSearches.map((r) => (
                  <button
                    key={r.q}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => runSearch(r.q, r.scope)}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"
                  >
                    <Clock size={13} className="text-slate-300" />
                    <span className="min-w-0 flex-1 truncate">{r.q}</span>
                    <span className="shrink-0 text-[10.5px] text-slate-400">{r.scope === "domestic" ? "🇰🇷 국내" : "🌐 해외"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {SCOPES.map((s) => {
              const active = scope === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => handleScopeChange(s.key)}
                  className={`flex h-14 items-center justify-center gap-2 rounded-2xl border text-[15px] font-semibold shadow-sm transition-colors ${
                    active
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <span className="text-lg leading-none">{s.flag}</span>
                  {s.label}
                </button>
              );
            })}
          </div>

          {!isSearching && !expandedSection && (
            <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {/* 전체 = 모든 필터 해제 */}
              <button
                onClick={() => {
                  setSeasonCheck(false);
                  setHotCheck(false);
                  setRegionOpen(false);
                  setRegionPath([]);
                }}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  !seasonCheck && !hotCheck && regionPath.length === 0
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                전체
              </button>
              {/* 계절/핫한: 서로도, 지역과도 겹쳐 쓸 수 있는 체크 필터 */}
              <button
                onClick={() => setSeasonCheck((v) => !v)}
                aria-pressed={seasonCheck}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  seasonCheck ? "border-amber-500 bg-amber-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {seasonCheck ? (
                  <Check size={12} className="mr-1 inline -mt-0.5" />
                ) : (
                  <Leaf size={12} className="mr-1 inline -mt-0.5" />
                )}
                계절별{browseData?.season ? ` · ${SEASON_LABEL[browseData.season]}` : ""}
              </button>
              <button
                onClick={() => setHotCheck((v) => !v)}
                aria-pressed={hotCheck}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  hotCheck ? "border-rose-500 bg-rose-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {hotCheck ? (
                  <Check size={12} className="mr-1 inline -mt-0.5" />
                ) : (
                  <Flame size={12} className="mr-1 inline -mt-0.5" />
                )}
                최근 핫한
              </button>
              {/* 지역별: 드릴다운 열기/닫기 (경로는 유지) */}
              <button
                onClick={() => setRegionOpen((v) => !v)}
                aria-pressed={regionOpen || regionPath.length > 0}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  regionOpen || regionPath.length > 0
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <CordixIcon name="pin" size={12} className="mr-1 inline -mt-0.5" />
                지역별{regionPath.length > 0 ? ` · ${regionPath[regionPath.length - 1]}` : ""}
              </button>
            </div>
          )}

          {/* 최근 검색어 — 포커스 드롭다운과 별개로, 화면에 항상 보이는
              원탭 재검색 버튼 줄 (검색 전 브라우즈 화면에서만) */}
          {!isSearching && !expandedSection && recentSearches.length > 0 && (
            <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-slate-400">
                <Clock size={12} /> 최근 검색
              </span>
              {recentSearches.map((r) => (
                <button
                  key={r.q}
                  onClick={() => runSearch(r.q, r.scope)}
                  className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-600"
                >
                  {r.scope === "domestic" ? "🇰🇷 " : "🌐 "}
                  {r.q}
                </button>
              ))}
            </div>
          )}

          {/* 지역별 drill-down: 대륙→국가→도시 (해외) / 광역→시군→동 (국내) */}
          {!isSearching && !expandedSection && (regionOpen || regionPath.length > 0) && (
            <div className="mt-3">
              <RegionDrilldown regionPath={regionPath} regionOptions={regionOptions} onSetPath={setRegionPath} />
            </div>
          )}
        </section>

        {browseData?.notice === "coming_soon" && !expandedSection && (
          <div className="mb-6 rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-center text-[13px] text-amber-700">
            이 지역 데이터는 아직 준비 중이에요 — 대신 지금 가장 인기 있는 장소를 보여드려요.
          </div>
        )}

        {/* 트레쥴이 손으로 고른 스팟이 아직 없는 지역 — 실시간 검색으로
            채운 결과라는 걸 밝힌다(#164, GoogleAttribution과 같은 이유:
            큐레이션 카드처럼 보이면 안 됨). */}
        {browseData?.notice === "live" && !expandedSection && (
          <div className="mb-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center text-[13px] text-slate-500">
            트레쥴이 직접 고른 스팟이 아직 적어요 — 실시간 검색 결과로 보충해드려요.
          </div>
        )}

        {/* ── MAIN CONTENT ── */}
        {expandedSection && bundle ? (
          <ExpandedSection
            kind={expandedSection}
            bundle={{ ...bundle, lodging: lodgingRanked }}
            regionPath={regionPath}
            regionOptions={regionOptions}
            onSetRegionPath={setRegionPath}
            onBack={() => setExpandedSection(null)}
            onAddSpot={handleAddSpot}
            onOpenDetail={handleOpenDetail}
            onPreviewRoute={setPreviewRoute}
          />
        ) : isSearching ? (
          <SearchResults
            key={activeQuery}
            query={activeQuery}
            scope={scope}
            onAddSpot={handleAddSpot}
            onOpenDetail={handleOpenDetail}
            onPreviewRoute={setPreviewRoute}
            onAddLivePlace={handleAddLivePlace}
            onOpenLiveDetail={handleOpenLiveDetail}
          />
        ) : (
          /* ── BROWSE CONTENT (switches on scope + category) ──
             mode="wait"였을 때 발견된 버그(#166 3차 프리뷰 검증): 빠른
             연속 지역 전환(scope/regionPath가 exit 애니메이션
             duration=0.25s보다 짧은 간격으로 여러 번 바뀜, 자동화 테스트
             클릭 시퀀스에서 재현) 아래에서 이전 key의 exit 애니메이션이
             framer-motion 내부적으로 완료 추적을 놓치면, "wait" 모드는
             그걸 기다리느라 새 key의 자식을 영영 마운트하지 않는다 —
             바깥의 배너/칩/브레드크럼(AnimatePresence 밖, 응답을 직접
             읽음)은 새 지역을 정확히 반영하는데 이 안의 카드 그리드만
             이전 지역 내용에 멈춰 있던 증상이 정확히 이거였다. 기본
             모드("sync")는 나가는 요소와 들어오는 요소가 서로를
             기다리지 않고 동시에 애니메이션되므로 이 실패 모드 자체가
             없다 — 전환이 살짝 덜 깔끔해 보일 수 있지만(잠깐 겹침),
             데이터가 영구히 멈추는 것보다 훨씬 낫다. */
          <AnimatePresence>
            <motion.div
              key={`${scope}-${seasonCheck}-${hotCheck}-${regionPath.join("/")}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-12"
            >
              {/* ✨ AI 추천 동선 — 지역만 고르면 하루 코스를 자동으로 짜주는 코스 만들기로 연결 */}
              <button
                onClick={() => router.push("/course")}
                className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-4 text-left text-white shadow-md transition-opacity hover:opacity-95"
              >
                <Sparkles size={22} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">AI 추천 동선으로 코스 짜기</span>
                  <span className="block text-[12px] text-white/85">지역만 고르면 관광지·맛집·카페·야경을 하루 코스로 자동 구성해드려요</span>
                </span>
                <ChevronRight size={20} className="shrink-0 text-white/80" />
              </button>

              {trendingReal.length > 0 && (
                <>
                  <SectionHeader
                    icon={hotCheck ? Flame : seasonCheck ? Sparkles : Flame}
                    iconClass="text-rose-500"
                    title={hotCheck ? "지금 가장 핫한 장소" : seasonCheck ? "이 계절 추천" : "지금 뜨는 장소"}
                    // 이 섹션은 실시간 집계가 아니라 트레쥴이 미리 골라둔
                    // 큐레이션 목록(순위는 saves 필드 기준 정렬) — "지금 담긴
                    // 실시간 핫플"이라는 문구는 실제로 존재하지 않는 실시간
                    // 신호를 있는 것처럼 말해 신뢰를 깎을 수 있어 표현을 바꿈.
                    caption="여행자들이 많이 찾는 인기 스팟"
                    onSeeAll={trendingReal.length > COMPACT_SPOT_COUNT ? () => setExpandedSection("trending") : undefined}
                  />
                  <div className="-mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                    {trendingCompact.map((spot, i) => (
                      <SpotCard
                        key={spot.id}
                        spot={spot}
                        rank={i + 1}
                        onAdd={() => handleAddSpot(spot)}
                        onOpenDetail={() => handleOpenDetail(spot)}
                      />
                    ))}
                  </div>
                </>
              )}

              {favoritesReal.length > 0 && (
                <>
                  <SectionHeader
                    icon={Crown}
                    iconClass="text-amber-500"
                    title="꾸준히 사랑받는 명소"
                    caption="언제 가도 좋은 스테디셀러 명소"
                    onSeeAll={favoritesReal.length > COMPACT_SPOT_COUNT ? () => setExpandedSection("favorites") : undefined}
                  />
                  <div className="-mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                    {favoritesCompact.map((spot) => (
                      <SpotCard
                        key={spot.id}
                        spot={spot}
                        onAdd={() => handleAddSpot(spot)}
                        onOpenDetail={() => handleOpenDetail(spot)}
                      />
                    ))}
                  </div>
                </>
              )}

              {!HIDE_LODGING_SECTION && lodgingSpots.length > 0 && (
                <>
                  <SectionHeader
                    icon={Hotel}
                    iconClass="text-sky-500"
                    title="인기 숙소"
                    caption={
                      regionPath.length > 0
                        ? `${regionPath[regionPath.length - 1]} 인기 숙소 순위`
                        : "지역별 칩으로 지역을 좁히면 그 지역 순위만 볼 수 있어요"
                    }
                    onSeeAll={lodgingSpots.length > COMPACT_SPOT_COUNT ? () => setExpandedSection("lodging") : undefined}
                  />
                  <div className="-mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                    {lodgingCompact.map((spot, i) => (
                      <SpotCard key={spot.id} spot={spot} rank={i + 1} onAdd={() => handleAddSpot(spot)} onOpenDetail={() => handleOpenDetail(spot)} />
                    ))}
                  </div>
                </>
              )}

              {bundle && trendingReal.length === 0 && favoritesReal.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
                  이 조건에 맞는 장소가 아직 없어요.
                </div>
              )}

              {bundle && bundle.routes.length > 0 && (
                <>
                  <SectionHeader
                    icon={MapIcon}
                    iconClass="text-indigo-500"
                    title="추천 코스"
                    caption="장소를 묶어둔 추천 코스 템플릿"
                    onSeeAll={bundle.routes.length > COMPACT_ROUTE_COUNT ? () => setExpandedSection("routes") : undefined}
                  />
                  <div className="-mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                    {routesCompact.map((route) => (
                      <RouteTemplateCard key={route.id} route={route} onAdd={() => handleAddRoute(route)} onPreview={() => setPreviewRoute(route)} />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}
        {!isSearching && (Object.keys(spotMetrics ?? {}).length > 0 || browseData?.notice === "live") && <GoogleAttribution />}
      </div>

      {/* "+" 퀵 버튼 — 일정에 추가할지 관심 장소(찜)에 추가할지 물어보는
          작은 선택 시트. 예전에는 항상 일정 추가로 바로 넘어가서 관심
          장소로 찜만 하고 싶을 때도 스케줄 모달부터 봐야 했다. */}
      {addChoiceTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0"
          onClick={() => {
            setAddChoiceTarget(null);
            setChoosingFolder(false);
          }}
        >
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
          <div
            className="relative w-full max-w-[340px] rounded-3xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="truncate text-[15px] font-bold text-slate-900">{addChoiceTarget.place.name}</p>
            {choosingFolder ? (
              <>
                <p className="mt-0.5 text-[12.5px] text-slate-500">어느 폴더에 저장할까요?</p>
                <div className="mt-3">
                  <FolderChips value={undefined} onChange={confirmAddToFavorites} />
                </div>
                <button
                  onClick={() => setChoosingFolder(false)}
                  className="mt-4 w-full text-center text-[12px] font-medium text-slate-400 hover:text-slate-600"
                >
                  뒤로
                </button>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-[12.5px] text-slate-500">어디에 추가할까요?</p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    onClick={confirmAddToSchedule}
                    className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-slate-900 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
                  >
                    <CalendarRange size={15} /> 일정에 추가
                  </button>
                  <button
                    onClick={() => setChoosingFolder(true)}
                    className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <Heart size={15} /> 관심 장소에 추가
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {scheduleSpot && (
        <ScheduleModal
          place={scheduleSpot}
          initialDate={todayISODate()}
          isHourTaken={isHourTaken}
          hasConflict={hasConflict}
          mode="create"
          showDuration
          onClose={() => setScheduleSpot(null)}
          onConfirm={(date, hour, minute, _budget, duration) => {
            setRegion(isDomesticCoordinate(scheduleSpot.lat, scheduleSpot.lng) ? "domestic" : "international");
            addPlaces([scheduleSpot]);
            addItem({
              placeId: scheduleSpot.id,
              name: scheduleSpot.name,
              date,
              time: `${pad2(hour)}:${pad2(minute)}`,
              coordinates: { lat: scheduleSpot.lat, lng: scheduleSpot.lng },
              durationMinutes: duration,
            });
            showToast(`${scheduleSpot.name} · ${formatDateLabelShort(date)} ${pad2(hour)}:${pad2(minute)}`);
            setScheduleSpot(null);
          }}
        />
      )}

      {/* ── 장소 상세 팝업 — 검색 결과 카드 탭 시 페이지 이동 없이 이 자리에서
          위치(미니맵)·메뉴 링크·메모·저장/일정 추가까지 처리 ── */}
      {detailPlace && (
        <MapProvider>
          <PlaceDetailOverlay
            place={detailPlace}
            onClose={() => setDetailPlace(null)}
            onSave={(p) => {
              setRegion(isDomesticCoordinate(p.lat, p.lng) ? "domestic" : "international");
              upsertSavedPlace(p);
              showToast(`${p.name} 관심 장소에 저장됨`);
              setDetailPlace(null);
            }}
            onSchedule={(p) => {
              setDetailPlace(null);
              requestSchedule(p);
            }}
          />
        </MapProvider>
      )}

      {schedulePickerPlace && (
        <SchedulePlanPickerModal
          placeName={schedulePickerPlace.name}
          savedPlans={savedPlans}
          activePlanId={activePlanId}
          hasUnsavedChanges={hasUnsavedPlanChanges}
          atCap={savedPlans.length >= MAX_SAVED_PLANS}
          onClose={() => setSchedulePickerPlace(null)}
          onConfirm={handleSchedulePlanPicked}
        />
      )}

      {routeTarget && <RouteDateModal route={routeTarget} onClose={() => setRouteTarget(null)} onConfirm={confirmRouteAdd} />}

      {/* Google Maps script only loads once a route preview is actually opened. */}
      {previewRoute && (
        <MapProvider>
          <RoutePreviewModal route={previewRoute} onClose={() => setPreviewRoute(null)} onAdd={() => handleAddRoute(previewRoute)} />
        </MapProvider>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900/90 px-3.5 py-2 text-xs text-white">
          {toast}
        </div>
      )}
    </div>
    </SpotMetricsContext.Provider>
  );
}

/**
 * Google Places 데이터를 표시하는 화면에 요구되는 출처 표기. 큐레이션
 * 카드(SpotCard)가 실제 rating을 하나라도 보여주고 있을 때만 렌더한다 —
 * 매칭 전이라 지표가 아직 하나도 안 보이는 상태에서 출처 표기부터
 * 뜨는 건 어색하다. LivePlaceCard 쪽 실시간 검색 결과는 애초에
 * Google/Kakao 지도 링크를 노출하므로 별도 표기가 이미 붙어 있다.
 */
function GoogleAttribution() {
  return (
    <p className="mt-8 text-center text-[11px] text-slate-400">
      평점·리뷰 정보 제공: Google
    </p>
  );
}

// ─────────────────────────────────────────────────────────────
function SectionHeader({
  icon: Icon,
  iconClass,
  title,
  caption,
  onSeeAll,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconClass: string;
  title: string;
  caption: string;
  onSeeAll?: () => void;
}) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 ${iconClass}`}>
            <Icon size={17} />
          </span>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        </div>
        <p className="mt-1 pl-10 text-[13px] text-slate-500">{caption}</p>
      </div>
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          className="flex items-center gap-0.5 text-[13px] font-semibold text-slate-400 transition-colors hover:text-slate-700"
        >
          전체보기 <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}

// ── 전체보기: a single section's full (unsliced) list with a back button ──
const SECTION_META: Record<SectionKind, { icon: React.ComponentType<{ size?: number; className?: string }>; iconClass: string; title: string }> = {
  trending: { icon: Flame, iconClass: "text-rose-500", title: "지금 뜨는 장소" },
  favorites: { icon: Crown, iconClass: "text-amber-500", title: "꾸준히 사랑받는 명소" },
  lodging: { icon: Hotel, iconClass: "text-sky-500", title: "인기 숙소" },
  routes: { icon: MapIcon, iconClass: "text-indigo-500", title: "추천 코스" },
};

function ExpandedSection({
  kind,
  bundle,
  regionPath,
  regionOptions,
  onSetRegionPath,
  onBack,
  onAddSpot,
  onOpenDetail,
  onPreviewRoute,
}: {
  kind: SectionKind;
  bundle: { trending: DiscoverSpot[]; favorites: DiscoverSpot[]; lodging: DiscoverSpot[]; routes: DiscoverRoute[] };
  regionPath: string[];
  regionOptions: RegionNode[];
  onSetRegionPath: (path: string[]) => void;
  onBack: () => void;
  onAddSpot: (spot: DiscoverSpot) => void;
  onOpenDetail: (spot: DiscoverSpot) => void;
  onPreviewRoute: (route: DiscoverRoute) => void;
}) {
  const meta = SECTION_META[kind];
  // 명소 섹션(지금 뜨는 장소/꾸준히 사랑받는 명소)에서는 숙소를 뺀다 — 숙소는
  // 별도 "인기 숙소" 섹션에서만 보여준다(사용자 피드백: 호텔이 명소 목록에
  // 섞여 나오면 어색함). 템플릿 생성 스팟(#164)도 컴팩트 프리뷰와 같은
  // 이유로 제외 — 안 그러면 "전체보기"를 눌렀을 때 프리뷰에선 숨겼던
  // 존재하지 않는 스팟이 그대로 쏟아진다.
  const spots =
    kind === "trending"
      ? bundle.trending.filter((s) => !isLodging(s.tag) && !isPlaceholderSpot(s))
      : kind === "favorites"
        ? bundle.favorites.filter((s) => !isLodging(s.tag) && !isPlaceholderSpot(s))
        : bundle.lodging;
  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1 text-[13px] font-semibold text-slate-500 hover:text-slate-800">
        <ChevronLeft size={15} /> 뒤로
      </button>
      <div className="mb-3 flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 ${meta.iconClass}`}>
          <meta.icon size={17} />
        </span>
        <div>
          <h2 className="text-xl font-bold tracking-tight">{meta.title}</h2>
          {kind === "lodging" && (
            <p className="text-[12px] text-slate-400">{regionPath.length > 0 ? `${regionPath[regionPath.length - 1]} 인기 숙소 순위` : "전체 지역 인기 숙소 순위 — 지역을 눌러 좁혀보세요"}</p>
          )}
        </div>
      </div>
      {/* 여기서 지역을 좁히면 페이지 전체(bundle)를 채우는 같은 regionPath
          상태가 바뀌면서 뒤로 나가지 않고도 바로 이 목록에 반영된다 —
          "전체보기 안에서도 지역별로 눌러볼 수 있어야" 한다는 사용자 피드백. */}
      {kind !== "routes" && (
        <div className="mb-5">
          <RegionDrilldown regionPath={regionPath} regionOptions={regionOptions} onSetPath={onSetRegionPath} />
        </div>
      )}
      {kind === "routes" ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {bundle.routes.map((route) => (
            <RouteTemplateCard key={route.id} route={route} onAdd={() => onPreviewRoute(route)} onPreview={() => onPreviewRoute(route)} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {spots.map((spot, i) => (
            <SpotCard
              key={spot.id}
              spot={spot}
              rank={kind === "lodging" ? i + 1 : undefined}
              onAdd={() => onAddSpot(spot)}
              onOpenDetail={() => onOpenDetail(spot)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Windows a page-number strip down to a readable size: 1, …, current-1, current, current+1, …, total. */
function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) result.push("gap");
    result.push(p);
  });
  return result;
}

// ── search results: popular routes ranked by likes + category/cuisine-filterable, server-paginated places ──
function SearchResults({
  query,
  scope,
  onAddSpot,
  onOpenDetail,
  onPreviewRoute,
  onAddLivePlace,
  onOpenLiveDetail,
}: {
  query: string;
  scope: DiscoverScope;
  onAddSpot: (spot: DiscoverSpot) => void;
  onOpenDetail: (spot: DiscoverSpot) => void;
  onPreviewRoute: (route: DiscoverRoute) => void;
  onAddLivePlace: (place: Place) => void;
  onOpenLiveDetail: (place: Place) => void;
}) {
  // All local to this component (remounted via `key={activeQuery}` in the
  // parent), so a fresh search always starts back at 전체/page 1 instead
  // of carrying over the previous search's filter/page.
  const [categoryFilter, setCategoryFilter] = useState<SpotCategoryFilter>("all");
  const [cuisineFilter, setCuisineFilter] = useState<CuisineFilter>("all");
  const [page, setPage] = useState(1);
  // Tracks whether the *user* has explicitly picked a category chip yet —
  // until they have, the server's auto-detected intent (from "경주 밥집"
  // style queries) is allowed to claim the chip on the response that
  // first reveals it. Once the user's clicked something themselves, that
  // auto-adoption never fires again for this search.
  const [userPickedCategory, setUserPickedCategory] = useState(false);
  const [autoSynced, setAutoSynced] = useState(false);

  // category/cuisine filtering + pagination all happen server-side now —
  // filtering client-side after the fact would only ever see whatever's
  // on the current page, which breaks as soon as there's more than one
  // page of a category. Sending "all" is equivalent to omitting the tag
  // param (fetchDiscoverSearch already treats them the same), which is
  // what lets the server's own intent-detection apply on the first load.
  const { data, isFetching } = useQuery({
    queryKey: ["discover-search", scope, query, categoryFilter, cuisineFilter, page],
    queryFn: () => fetchDiscoverSearch(scope, query, { tag: categoryFilter, cuisine: cuisineFilter, page, limit: SEARCH_PAGE_LIMIT }),
    // page/category/cuisine are all part of the query key, so each change
    // is technically a brand-new query with no cache entry — without this,
    // `data` would drop to undefined on every page click (React Query has
    // no "previous page" to fall back to), collapsing the skeleton branch
    // below (isFetching && Boolean(data)) back into the full-page "검색
    // 중…" state instead of just refreshing the card grid.
    placeholderData: keepPreviousData,
    // Re-running the same search within a few minutes (back-navigation,
    // chip toggling back and forth) serves from cache instead of
    // re-hitting the server.
    staleTime: 5 * 60 * 1000,
  });

  // Real, live results (Google Places Text Search overseas / Kakao Local
  // domestic) — an entirely separate query from the curated-seed-data one
  // above, since a live API call can't be server-side paginated the same
  // way and should never block or error out the curated section if it
  // fails. `liveResults` is [] (never an error) whenever keys are missing
  // or the call fails, so this section just quietly doesn't render then.
  const userLoc = useUserLocation();
  const { data: liveData, isFetching: isLiveFetching } = useQuery({
    queryKey: ["discover-live-search", scope, query, categoryFilter, userLoc.location],
    queryFn: () => fetchLivePlaceSearch(scope, query, categoryFilter === "all" ? undefined : categoryFilter, userLoc.location),
    // Each live call is real (billed) Google/Kakao quota — coming back to
    // the same search within a few minutes must reuse the cached results,
    // not re-bill the API.
    staleTime: 5 * 60 * 1000,
  });
  const liveResults = liveData?.places;
  // The live call can take a beat (real network round trip, unlike the
  // curated results which are already in memory) — while it's still in
  // flight for this exact search, `liveResults` reads as empty just like a
  // genuine zero-hit search would, so the "결과 없음" state below must wait
  // for it instead of flashing immediately.
  const isLiveInitialLoading = isLiveFetching && liveData === undefined;

  // "더 보기" — additional Google results fetched beyond the initial batch,
  // only when the server found a real `nextPageToken` (thin domestic
  // searches, e.g. "내외동 술집" landing at ~15 hits). Kept as separate
  // local state from the react-query cache above since it's an explicit
  // user action layered on top of one search, not the search itself.
  const [moreLivePlaces, setMoreLivePlaces] = useState<Place[]>([]);
  const [moreLiveToken, setMoreLiveToken] = useState<string | null | undefined>(undefined);
  const [loadingMoreLive, setLoadingMoreLive] = useState(false);
  const availableLiveToken = moreLiveToken !== undefined ? moreLiveToken : liveData?.nextPageToken;
  const liveSearchKeyValue = `${scope}|${query}|${categoryFilter}`;
  const [liveSearchKey, setLiveSearchKey] = useState(liveSearchKeyValue);
  if (liveSearchKey !== liveSearchKeyValue) {
    setLiveSearchKey(liveSearchKeyValue);
    setMoreLivePlaces([]);
    setMoreLiveToken(undefined);
  }
  const handleLoadMoreLive = async () => {
    if (!availableLiveToken || loadingMoreLive) return;
    setLoadingMoreLive(true);
    try {
      const more = await fetchLivePlaceSearch(
        scope,
        query,
        categoryFilter === "all" ? undefined : categoryFilter,
        userLoc.location,
        availableLiveToken,
      );
      setMoreLivePlaces((prev) => {
        const seenIds = new Set([...(liveResults ?? []), ...prev].map((p) => p.id));
        return [...prev, ...more.places.filter((p) => !seenIds.has(p.id))];
      });
      setMoreLiveToken(more.nextPageToken ?? null);
    } finally {
      setLoadingMoreLive(false);
    }
  };

  const [liveSort, setLiveSort] = useState<LiveSortKey>("relevance");
  // "내 주변순" needs the device's actual position first — tapping it before
  // we have one kicks off the (permission-gated) browser Geolocation request
  // and only flips the sort once that resolves, instead of silently no-op'ing.
  const handleLiveSortClick = (key: LiveSortKey) => {
    if (key === "distance" && !userLoc.location) {
      userLoc.request(() => setLiveSort("distance"));
      return;
    }
    setLiveSort(key);
  };
  // Which flag on the results map is highlighted — set by tapping either
  // the flag itself or a card in the list below, so both always point at
  // the same place.
  const [selectedLiveId, setSelectedLiveId] = useState<string | null>(null);
  // Hovering a result *card* below should enlarge its flag on the map above
  // (desktop only — cards have no hover on touch) — lifted up here so both
  // the map (hovering a flag) and the card list (hovering a card) drive the
  // same shared highlight instead of each only reacting to its own hover.
  const [hoveredLiveId, setHoveredLiveId] = useState<string | null>(null);
  const sortedLiveResults = useMemo(
    () => sortPlaces([...(liveResults ?? []), ...moreLivePlaces], liveSort, userLoc.location),
    [liveResults, moreLivePlaces, liveSort, userLoc.location],
  );

  // 서버가 최대 ~60개까지 한 번에 가져와두므로(재요청 없음), 여기서
  // 페이지 단위로 잘라 보여준다 — 정렬이나 검색어가 바뀌면 1페이지로. 렌더
  // 중에 바로 조정한다(useEffect로 setState하면 리렌더가 한 프레임 밀린다) —
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [livePage, setLivePage] = useState(1);
  const livePageResetKeyValue = `${scope}|${query}|${categoryFilter}|${liveSort}`;
  const [livePageResetKey, setLivePageResetKey] = useState(livePageResetKeyValue);
  if (livePageResetKey !== livePageResetKeyValue) {
    setLivePageResetKey(livePageResetKeyValue);
    setLivePage(1);
  }
  const liveTotalPages = Math.max(1, Math.ceil(sortedLiveResults.length / LIVE_RESULT_PAGE_SIZE));
  const pagedLiveResults = sortedLiveResults.slice((livePage - 1) * LIVE_RESULT_PAGE_SIZE, livePage * LIVE_RESULT_PAGE_SIZE);

  // 정렬된 결과를 테마 버킷으로 묶는다 — 비어있는 버킷은 만들지 않는다
  // (예: 이 검색에 술집이 하나도 없으면 술집 섹션/칩 자체가 안 나온다). 현재
  // 페이지에 있는 결과만 묶어서, 테마 칩 개수도 이 페이지 기준으로 맞는다.
  const liveBuckets = useMemo(() => {
    const groups = new Map<LiveBucketKey, Place[]>();
    for (const place of pagedLiveResults) {
      const key = liveCategoryBucket(place.category ?? "");
      const list = groups.get(key) ?? [];
      list.push(place);
      groups.set(key, list);
    }
    return LIVE_BUCKET_GROUPS.map((g) => ({ ...g, places: groups.get(g.key) ?? [] })).filter((g) => g.places.length > 0);
  }, [pagedLiveResults]);

  const scrollToLiveBucket = (key: LiveBucketKey) => {
    document.getElementById(`live-bucket-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (data && !autoSynced && !userPickedCategory) {
    setAutoSynced(true);
    if (data.appliedCategory !== "all") setCategoryFilter(data.appliedCategory as SpotCategoryFilter);
  }

  const handleCategoryClick = (key: SpotCategoryFilter) => {
    setUserPickedCategory(true);
    setCategoryFilter(key);
    setCuisineFilter("all");
    setPage(1);
  };
  const handleCuisineClick = (key: CuisineFilter) => {
    setCuisineFilter(key);
    setPage(1);
  };

  const isInitialLoading = isFetching && !data;
  if (isInitialLoading) {
    return <div className="py-20 text-center text-sm text-slate-400">&ldquo;{query}&rdquo; 검색 중…</div>;
  }
  if (!data) return null;

  const { spots, routes } = data.results;
  const { total, hasMore } = data.pagination;
  const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_LIMIT));
  const isRefetching = isFetching && Boolean(data);
  const hasLiveResults = Boolean(liveResults && liveResults.length > 0);

  if (routes.length === 0 && total === 0 && !isRefetching && !hasLiveResults && isLiveInitialLoading) {
    return <div className="py-20 text-center text-sm text-slate-400">&ldquo;{query}&rdquo; 검색 중…</div>;
  }
  if (routes.length === 0 && total === 0 && !isRefetching && !hasLiveResults && !isLiveInitialLoading) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
        <p className="text-sm text-slate-500">&ldquo;{query}&rdquo;에 대한 결과가 없어요.</p>
        <p className="mt-1 text-[12px] text-slate-400">다른 지역이나 명소 이름으로 검색해보세요.</p>
      </div>
    );
  }

  // Only "전체" can mix tags on one page (a specific chip is already
  // server-filtered to a single tag) — group by tag purely for display,
  // no filtering happens here.
  const groupedSpots: [PlaceCategoryTag, DiscoverSpot[]][] = (() => {
    if (categoryFilter !== "all") return spots.length > 0 ? [[categoryFilter, spots]] : [];
    const groups = new Map<PlaceCategoryTag, DiscoverSpot[]>();
    for (const spot of spots) {
      const list = groups.get(spot.tag) ?? [];
      list.push(spot);
      groups.set(spot.tag, list);
    }
    return Array.from(groups.entries());
  })();

  return (
    <div className="space-y-12">
      {/* ── ① 관련 지역 인기 루트 ── */}
      {routes.length > 0 && page === 1 && (
        <section>
          {/* "여행자들의 루트"는 실제 유저가 만든 게 아니라 트레쥴 큐레이션
              템플릿이라 route.author 배지를 "트레쥴 큐레이션"으로 바꾼
              것과 같은 이유로 문구를 맞춤. */}
          <SectionHeader icon={Crown} iconClass="text-amber-500" title={`"${query}" 인기 루트`} caption="좋아요 · 조회수가 높은 트레쥴 큐레이션 루트" />
          <div className="-mt-6 mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
            {routes.map((route) => (
              <RouteTemplateCard key={route.id} route={route} onAdd={() => onPreviewRoute(route)} onPreview={() => onPreviewRoute(route)} />
            ))}
          </div>
        </section>
      )}

      {(total > 0 || isRefetching) && (
        <section>
          <SectionHeader
            icon={MapIcon}
            iconClass="text-indigo-500"
            title={`"${query}" 카테고리별 장소`}
            caption="원하는 카테고리를 골라 맛집·숙소까지 찾아보세요"
          />
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SEARCH_CATEGORY_FILTERS.map((c) => {
              const active = categoryFilter === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => handleCategoryClick(c.key)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                    active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* 음식점 세부 카테고리 — 일식/한식/양식·아시안/카페·디저트 */}
          {categoryFilter === "음식점" && (
            <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CUISINE_FILTERS.map((c) => {
                const active = cuisineFilter === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => handleCuisineClick(c.key)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors ${
                      active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-indigo-300"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}

          {isRefetching ? (
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {Array.from({ length: Math.min(SEARCH_PAGE_LIMIT, 8) }, (_, i) => (
                <SpotCardSkeleton key={i} />
              ))}
            </div>
          ) : groupedSpots.length === 0 ? (
            <p className="mt-8 text-center text-[13px] text-slate-400">이 카테고리에는 결과가 없어요.</p>
          ) : (
            <div className="mt-6 space-y-8">
              {groupedSpots.map(([tag, tagSpots]) => {
                const TagIcon = CATEGORY_ICONS[tag];
                return (
                  <div key={tag}>
                    {categoryFilter === "all" && (
                      <div className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-slate-700">
                        <TagIcon size={14} className="text-slate-400" />
                        {tag}
                        <span className="text-[11px] font-medium text-slate-400">{tagSpots.length}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      {tagSpots.map((spot) => (
                        <SpotCard key={spot.id} spot={spot} onAdd={() => onAddSpot(spot)} onOpenDetail={() => onOpenDetail(spot)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isFetching}
                aria-label="이전 페이지"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              {pageWindow(page, totalPages).map((p, i) =>
                p === "gap" ? (
                  <span key={`gap-${i}`} className="px-1 text-[12px] text-slate-300">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    disabled={isFetching}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-[12.5px] font-semibold tabular-nums transition-colors ${
                      p === page ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                onClick={() => setPage((p) => (hasMore ? p + 1 : p))}
                disabled={!hasMore || isFetching}
                aria-label="다음 페이지"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </section>
      )}

      {/* 실시간 결과가 아직 안 왔을 뿐인데 큐레이션 결과만 보고 "검색 끝났다"고
          오해하지 않도록 — 큐레이션 섹션이 이미 그려진 상태(위 초기 로딩
          가드는 통과)라도 실시간 쪽은 별도로 로딩 중일 수 있다. */}
      {page === 1 && isLiveInitialLoading && !hasLiveResults && (
        <p className="py-3 text-center text-[12.5px] text-slate-400">실시간 검색 결과 불러오는 중…</p>
      )}

      {/* ── ③ 그 외 종합 — 실시간(Google/Kakao) 전체 결과, 맨 마지막 ── */}
      {hasLiveResults && page === 1 && (
        <section>
          <SectionHeader
            icon={Search}
            iconClass="text-success-500"
            title={`"${query}" 그 외 종합 결과`}
            caption={scope === "overseas" ? "Google 지도 기준 실제 장소 · 평점" : "카카오맵 기준 실제 장소"}
          />
          {/* 검색된 가게들이 플래그로 찍힌 결과 지도 — 정렬/테마 칩보다 먼저,
              섹션에 들어오면 바로 한눈에 지도부터 보이도록 맨 위에 둔다.
              플래그 탭 = 요약 팝업(메뉴 링크·상세), 아래 목록 카드 탭 = 해당
              플래그 선택. */}
          <MapProvider>
            <div className="mt-3 h-72 overflow-hidden rounded-2xl border border-slate-200 shadow-sm sm:h-80">
              <LiveResultsMap
                places={pagedLiveResults}
                selectedId={selectedLiveId}
                onSelect={setSelectedLiveId}
                onOpenDetail={onOpenLiveDetail}
                hoveredId={hoveredLiveId}
                onHoverChange={setHoveredLiveId}
              />
            </div>
          </MapProvider>

          <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {LIVE_SORTS.map((s) => {
              const active = liveSort === s.key;
              const isDistance = s.key === "distance";
              return (
                <button
                  key={s.key}
                  onClick={() => handleLiveSortClick(s.key)}
                  disabled={isDistance && userLoc.locating}
                  className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors disabled:opacity-60 ${
                    active ? "border-success-600 bg-success-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-success-300"
                  }`}
                >
                  {isDistance && <MapPin size={11} />}
                  {isDistance && userLoc.locating ? "위치 확인 중…" : s.label}
                </button>
              );
            })}
          </div>
          {userLoc.error && <p className="mt-1.5 text-[11.5px] text-rose-500">{userLoc.error}</p>}

          {/* 테마 칩 — 페이지 이동이 아니라 아래 해당 테마 섹션으로 스크롤 이동만 한다. */}
          {liveBuckets.length > 1 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {liveBuckets.map((g) => (
                <button
                  key={g.key}
                  onClick={() => scrollToLiveBucket(g.key)}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11.5px] font-medium text-slate-600 transition-colors hover:border-success-300 hover:text-success-600"
                >
                  <g.icon size={12} />
                  {g.label} <span className="text-slate-400">{g.places.length}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 space-y-8">
            {liveBuckets.map((g) => (
              <div key={g.key} id={`live-bucket-${g.key}`} className="scroll-mt-20">
                <div className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-slate-700 dark:text-slate-200">
                  <g.icon size={14} className="text-slate-400" />
                  {g.label}
                  <span className="text-[11px] font-medium text-slate-400">{g.places.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {g.places.map((place) => (
                    <LivePlaceCard
                      key={place.id}
                      place={place}
                      region={scope === "overseas" ? "international" : "domestic"}
                      onAdd={() => onAddLivePlace(place)}
                      onOpenDetail={() => {
                        setSelectedLiveId(place.id);
                        onOpenLiveDetail(place);
                      }}
                      onHoverChange={(hovered) => setHoveredLiveId((cur) => (hovered ? place.id : cur === place.id ? null : cur))}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <PlacePager page={livePage} totalPages={liveTotalPages} onChange={setLivePage} />
          {livePage === liveTotalPages && availableLiveToken && (
            <button
              type="button"
              onClick={handleLoadMoreLive}
              disabled={loadingMoreLive}
              className="mx-auto mt-2 flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              {loadingMoreLive ? "찾는 중…" : "다른 결과 더 찾아보기"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function SpotCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
      <div className="h-28 bg-slate-200" />
      <div className="space-y-2 px-3 pb-3 pt-6">
        <div className="h-3.5 w-3/4 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-100" />
        <div className="mt-3 h-6 w-full rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

// ── spot card (trending / favorites / search result) ──
function SpotCard({
  spot,
  rank,
  onAdd,
  onOpenDetail,
}: {
  spot: DiscoverSpot;
  rank?: number;
  onAdd: () => void;
  onOpenDetail: () => void;
}) {
  const Icon = SPOT_ICONS[spot.iconKey];
  // Representative photo resolved live by name+city (see
  // /api/discover/spot-photo) — 404/no-key/no-match just falls back to
  // the curated gradient, so the card never shows a broken image.
  const [photoFailed, setPhotoFailed] = useState(false);
  const metrics = useContext(SpotMetricsContext)[spot.id];
  return (
    <div
      onClick={onOpenDetail}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200"
    >
      <div className={`relative h-28 bg-gradient-to-br ${spot.gradient}`}>
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_30%_20%,white,transparent_40%)]" />
        {!photoFailed && (
          // eslint-disable-next-line @next/next/no-img-element -- remote Places photo behind our own redirect proxy; see LivePlaceCard
          <img
            src={`/api/discover/spot-photo?q=${encodeURIComponent(`${spot.name} ${spot.region.split(" · ").join(" ")}`)}`}
            alt={spot.name}
            loading="lazy"
            onError={() => setPhotoFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* No live photo matched this spot's name — a bare gradient reads as
            a broken/missing image, especially sitting next to cards that do
            have a real photo. A large centered glyph makes the no-photo
            state look like a deliberate illustrated tile instead. */}
        {photoFailed && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Icon size={40} className="text-white/40" />
          </div>
        )}
        <div className="absolute right-2 top-2">
          <Badge className="border-none bg-white/85 text-[10px] font-semibold text-slate-700 backdrop-blur">
            {spot.tag}
          </Badge>
        </div>
        {rank && (
          <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-lg bg-black/30 text-xs font-bold text-white backdrop-blur">
            {rank}
          </span>
        )}
        <span className="absolute -bottom-4 left-3 flex h-10 w-10 items-center justify-center rounded-xl border-2 border-white bg-white text-slate-700 shadow-md">
          <Icon size={18} />
        </span>
      </div>
      <div className="px-3 pb-3 pt-6">
        <p className="truncate text-sm font-bold text-slate-900">{spot.name}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
          <CordixIcon name="pin" size={11} /> {spot.region}
        </p>
        <div className="mt-2 flex items-center">
          {/* 지표(⭐평점 · 리뷰수)는 실제 Google 데이터가 있을 때만 —
              placeId 미확정/편집 개념 카드/갱신 배치 전이면 이 자리를
              통째로 렌더하지 않는다(빈 별점·0건 표시는 있는 것보다 나쁘다).
              favorite/trending 아이콘 단독 표시로 자리를 채우지 않는 것도
              같은 이유 — "N명 저장"이 가짜 지표였던 것과 마찬가지로,
              근거 없는 인기 신호를 남겨두지 않는다. */}
          {metrics?.rating != null && (
            <span className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-slate-600">
              <CordixIcon name="star" size={11} stroke="#fbbf24" accent="#fbbf24" className="shrink-0" />
              {metrics.rating.toFixed(1)}
              {metrics.reviewCount != null && (
                <span className="truncate font-normal text-slate-400">· 리뷰 {fmt(metrics.reviewCount)}</span>
              )}
              {metrics.priceLevel != null && metrics.priceLevel > 0 && (
                <span className="shrink-0 font-semibold text-success-600">· {"₩".repeat(metrics.priceLevel)}</span>
              )}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            aria-label={`${spot.name} 일정에 추가`}
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-indigo-500 hover:text-white"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── live search result card — a real Google Places / Kakao Local hit, not
// one of /discover's own curated spots, so there's no gradient/saves/
// subTags to show, just whatever the live API actually returned. ──
function LivePlaceCard({
  place,
  region,
  onAdd,
  onOpenDetail,
  onHoverChange,
}: {
  place: Place;
  region: Region;
  onAdd: () => void;
  onOpenDetail: () => void;
  /** Drives the matching flag's hover-enlarge on the results map above (desktop only). */
  onHoverChange?: (hovered: boolean) => void;
}) {
  const lodging = isLodging(place.category);
  const providers = lodging ? bookingProviders(place.name, region) : [];
  const showAffiliate = hasAffiliateLink(providers);
  // Kakao Local (국내) search never returns a photo of its own — unlike
  // Google Places, its keyword API has no photo field at all. Falls back to
  // the same live name+address lookup SpotCard uses for curated spots with
  // no photo of their own (/api/discover/spot-photo); 404/no-match just
  // reverts to the gradient placeholder below, same as SpotCard.
  const [photoFailed, setPhotoFailed] = useState(false);
  return (
    <div
      onClick={onOpenDetail}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200"
    >
      <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-500">
        {place.photoName ? (
          // eslint-disable-next-line @next/next/no-img-element -- served via our own /api/places/photo redirect proxy to a short-lived googleusercontent URL; next/image's optimizer can't be allowlisted for a URL that changes per request
          <img
            src={`/api/places/photo?name=${encodeURIComponent(place.photoName)}&w=640`}
            alt={place.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : !photoFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- /api/discover/spot-photo proxy, see SpotCard
          <img
            src={`/api/discover/spot-photo?q=${encodeURIComponent(`${place.name} ${place.address ?? ""}`.trim())}`}
            alt={place.name}
            loading="lazy"
            onError={() => setPhotoFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <>
            <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_30%_20%,white,transparent_40%)]" />
            <CordixIcon name="pin" size={26} className="text-white/90" />
          </>
        )}
        <div className="absolute right-2 top-2">
          <Badge className="border-none bg-white/85 text-[10px] font-semibold text-slate-700 backdrop-blur">
            {liveTypeLabel(place.category)}
          </Badge>
        </div>
      </div>
      <div className="px-3 pb-3 pt-3">
        <p className="truncate text-sm font-bold text-slate-900">
          {place.name}
          {place.nativeName && <span className="ml-1 font-normal text-slate-400">({place.nativeName})</span>}
        </p>
        {place.address && (
          <p className="mt-0.5 line-clamp-1 flex items-center gap-1 text-[11px] text-slate-500">
            <CordixIcon name="pin" size={11} /> {place.address}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-1">
          {place.rating != null ? (
            <span className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-slate-600">
              <CordixIcon name="star" size={11} stroke="#fbbf24" accent="#fbbf24" className="shrink-0" />
              {place.rating.toFixed(1)}
              {place.reviewCount != null && (
                <span className="truncate font-normal text-slate-400">· 리뷰 {fmt(place.reviewCount)}</span>
              )}
              {place.priceLevel != null && place.priceLevel > 0 && (
                <span className="shrink-0 font-semibold text-success-600">· {"₩".repeat(place.priceLevel)}</span>
              )}
            </span>
          ) : (
            <span className="text-[10.5px] font-medium text-slate-400">실제 지도 데이터</span>
          )}
          <span className="flex shrink-0 items-center gap-1">
            {place.googleMapsUri && (
              <a
                href={place.googleMapsUri}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex h-7 items-center gap-1 rounded-full bg-slate-100 px-2 text-[10.5px] font-semibold text-slate-500 transition-colors hover:bg-success-500 hover:text-white"
              >
                <ExternalLink size={11} /> 메뉴·리뷰
              </a>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              aria-label={`${place.name} 일정에 추가`}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-indigo-500 hover:text-white"
            >
              <Plus size={15} />
            </button>
          </span>
        </div>
        {lodging && providers.length > 0 && (
          <div className="mt-2 border-t border-slate-100 pt-2">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-slate-400">
              <CordixIcon name="bed" size={11} className="text-indigo-400" /> 최저가 예약
              {showAffiliate && <span className="rounded bg-slate-100 px-1 py-px text-[9px] font-medium text-slate-400">제휴</span>}
            </div>
            <div className="flex flex-wrap gap-1">
              {providers.map((p) => (
                <a
                  key={p.key}
                  href={p.url}
                  target="_blank"
                  // sponsored+nofollow per Google's affiliate-link policy; noreferrer for privacy.
                  rel="sponsored nofollow noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: p.brand, borderColor: `${p.brand}55` }}
                  className="rounded-full border bg-white px-2 py-1 text-[10.5px] font-semibold transition-colors hover:bg-slate-50"
                >
                  {p.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── route template card — body click previews the route, the pill button schedules it ──
function RouteTemplateCard({ route, onAdd, onPreview }: { route: DiscoverRoute; onAdd: () => void; onPreview: () => void }) {
  return (
    <div
      onClick={onPreview}
      className="group cursor-pointer overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm transition-all hover:shadow-xl hover:shadow-slate-200"
    >
      <div className={`relative overflow-hidden bg-gradient-to-br ${route.gradient} px-5 py-4`}>
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_80%_10%,white,transparent_45%)]" />
        <div className="relative flex items-center justify-between">
          <Badge className="border-none bg-white/90 text-[11px] font-semibold text-slate-700">
            {route.region}
          </Badge>
          <span className="flex items-center gap-1 text-[11px] font-medium text-white/90">
            <Clock size={12} /> {route.duration}
          </span>
        </div>
        <h3 className="relative mt-3 text-lg font-bold text-white">{route.title}</h3>
        <p className="relative text-[12.5px] text-white/85">{route.subtitle}</p>
        <div className="relative mt-3 flex items-center gap-3 text-[11.5px] font-semibold text-white/90">
          <span className="flex items-center gap-1">
            <Heart size={12} /> {fmt(route.likes)}
          </span>
          <span className="flex items-center gap-1">
            <Eye size={12} /> {fmt(route.views)}
          </span>
          {/* route.author was previously shown as "by 방콕러버" — these
              routes are hand-curated by 트레쥴, not submitted by that named
              person, so a fabricated username there reads as fake social
              proof once you notice it. A plain curation badge says the same
              "someone put thought into this" without inventing a person. */}
          <span className="text-white/70">트레쥴 큐레이션</span>
        </div>
      </div>

      {/* timeline stops */}
      <div className="px-5 py-4">
        <div className="relative pl-1">
          <div className="absolute bottom-2 left-[6px] top-2 w-px bg-slate-200" />
          {route.stops.map((stop, i) => (
            <div key={i} className="relative flex items-center gap-3 py-1.5">
              <span className="z-10 h-3 w-3 rounded-full border-2 border-white bg-indigo-400 shadow-sm ring-1 ring-slate-200" />
              <span className="w-12 shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">
                {stop.time}
              </span>
              <span className="truncate text-[13px] font-medium text-slate-700">{stop.name}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-[12px] text-slate-400">전체 경로 보기</span>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="h-9 gap-1 rounded-full bg-indigo-600 px-4 text-[13px] font-semibold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-700"
          >
            <Plus size={15} />전체 일정에 담기
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── route preview modal: full stop list + a real Google Map polyline ──
function RoutePreviewModal({ route, onClose, onAdd }: { route: DiscoverRoute; onClose: () => void; onAdd: () => void }) {
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center sm:px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        >
          <div className="relative h-56 w-full shrink-0 bg-[#eef2f4]">
            <RoutePreviewMap stops={route.stops} />
            <button
              onClick={onClose}
              aria-label="닫기"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow"
            >
              <X size={14} color="#64748b" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <Badge className="border-none bg-indigo-50 text-[11px] font-semibold text-indigo-600">{route.region}</Badge>
            <h3 className="mt-2 text-lg font-bold text-slate-900">{route.title}</h3>
            <p className="text-[13px] text-slate-500">{route.subtitle}</p>
            <div className="mt-2 flex items-center gap-3 text-[12px] font-medium text-slate-500">
              <span className="flex items-center gap-1">
                <Heart size={12} /> {fmt(route.likes)}
              </span>
              <span className="flex items-center gap-1">
                <Eye size={12} /> {fmt(route.views)}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} /> {route.duration}
              </span>
            </div>

            <div className="relative mt-5 pl-1">
              <div className="absolute bottom-2 left-[10px] top-2 w-px bg-slate-200" />
              {route.stops.map((stop, i) => (
                <div key={i} className="relative flex items-center gap-3 py-2">
                  <span className="z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white ring-2 ring-white">
                    {i + 1}
                  </span>
                  <span className="w-12 shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">{stop.time}</span>
                  <span className="truncate text-[13px] font-medium text-slate-700">{stop.name}</span>
                </div>
              ))}
            </div>

            <Button
              onClick={onAdd}
              className="mt-5 h-12 w-full gap-1.5 rounded-2xl bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus size={15} />전체 일정에 담기
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// RoutePreviewMap lives in ./RoutePreviewMap.tsx now, always loaded via
// next/dynamic({ ssr: false }) below — see that file for why.

// ── date-only picker for adding a whole route bundle at once ──
function RouteDateModal({ route, onClose, onConfirm }: { route: DiscoverRoute; onClose: () => void; onConfirm: (date: string) => void }) {
  const [date, setDate] = useState(todayISODate());

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[70] flex items-center justify-center px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative w-full max-w-[360px] rounded-3xl bg-white p-5 shadow-2xl"
          initial={{ scale: 0.92, y: 10, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 10, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
          <button onClick={onClose} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label="닫기">
            <X size={14} />
          </button>

          <div className="flex items-center gap-2 text-slate-900">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
              <CalendarRange size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{route.duration}</p>
              <p className="truncate text-[15px] font-semibold leading-tight">{route.title}</p>
            </div>
          </div>

          <p className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">며칠에 담을까요?</p>
          <MonthCalendar selected={date} onSelect={setDate} accentColor="#4f46e5" />

          <p className="mt-4 text-[12px] text-slate-500">각 장소는 루트에 제시된 시간대에 맞춰 배치돼요. 이미 예약된 시간대는 자동으로 다음 빈 시간으로 옮겨져요.</p>

          <button onClick={() => onConfirm(date)} className="mt-5 h-12 w-full rounded-2xl bg-indigo-600 text-sm font-semibold text-white transition-transform active:scale-[0.98] hover:bg-indigo-700">
            {formatDateLabelShort(date)}에 전체 담기
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
