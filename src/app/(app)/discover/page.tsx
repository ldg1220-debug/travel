"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  TrendingUp,
  Star,
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScheduleModal } from "@/components/ScheduleModal";
import { PlaceDetailOverlay } from "@/app/(app)/planner/PlaceDetailOverlay";
import { MonthCalendar } from "@/components/MonthCalendar";
import { MapProvider } from "@/app/(app)/planner/MapProvider";
import { useItineraryStore } from "@/store/itineraryStore";
import { fetchDiscoverBundle, fetchDiscoverSearch, fetchLivePlaceSearch } from "@/lib/api";
import { formatDateLabelShort, hourFromTime, pad2, todayISODate, TIMELINE_HOURS } from "@/lib/timeline";
import { SEASON_LABEL } from "@/lib/discoverData";
import { useRecentSearches } from "@/lib/useRecentSearches";
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
import type { Place, PlaceIcon } from "@/lib/types";

// Always client-only — see RoutePreviewMap.tsx / lib/maps/mapResize.ts.
const RoutePreviewMap = dynamic(() => import("./RoutePreviewMap"), { ssr: false });
const LiveResultsMap = dynamic(() => import("./LiveResultsMap"), { ssr: false });

type CategoryFilter = "all" | "season" | "hot" | "region";
type SectionKind = "trending" | "favorites" | "routes";
const COMPACT_SPOT_COUNT = 4;
const COMPACT_ROUTE_COUNT = 2;

const SCOPES: { key: DiscoverScope; label: string; flag: string }[] = [
  { key: "domestic", label: "국내 여행", flag: "🇰🇷" },
  { key: "overseas", label: "해외 여행", flag: "🌐" },
];

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "season", label: "계절별" },
  { key: "hot", label: "최근 핫한" },
  { key: "region", label: "지역별" },
];

/** Search results' "카테고리별 장소" sub-filter chips — a coarser subset of PlaceCategoryTag focused on trip-planning essentials (맛집/숙소 pickup), not every tag the data model supports. */
type SpotCategoryFilter = "all" | PlaceCategoryTag;
const SEARCH_CATEGORY_FILTERS: { key: SpotCategoryFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "관광지", label: "관광지" },
  { key: "테마파크", label: "테마파크" },
  { key: "음식점", label: "음식점" },
  { key: "술집", label: "술집" },
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

/** Client-side sort for the 실시간 검색 결과 section (≤20 results, so sorting in the browser is fine). "relevance" keeps Google's own ranking. */
type LiveSortKey = "relevance" | "rating" | "reviews";
const LIVE_SORTS: { key: LiveSortKey; label: string }[] = [
  { key: "relevance", label: "관련도순" },
  { key: "rating", label: "별점순" },
  { key: "reviews", label: "리뷰많은순" },
];

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
  return { id, placeId: id, name: stop.name, category: "루트 경유지", color: "#818cf8", lat: stop.lat, lng: stop.lng, icon: "pin" };
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

// ─────────────────────────────────────────────────────────────
// The global App Bar (hamburger + title + Sheet nav) already lives in
// src/components/AppBar.tsx, rendered once by src/app/(app)/layout.tsx
// above every screen in this group — this page owns only the content
// below it, not another header.
export default function DiscoverPage() {
  const router = useRouter();
  const addPlaces = useItineraryStore((s) => s.addPlaces);
  const addItem = useItineraryStore((s) => s.addItem);
  const isHourTaken = useItineraryStore((s) => s.isHourTaken);
  const setCurrentCity = useItineraryStore((s) => s.setCurrentCity);
  const upsertSavedPlace = useItineraryStore((s) => s.upsertSavedPlace);

  const [scope, setScope] = useState<DiscoverScope>("domestic");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [regionPath, setRegionPath] = useState<string[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [scheduleSpot, setScheduleSpot] = useState<Place | null>(null);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
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

  // ── browse feed: branches by scope + category, hits a real API route ──
  const { data: browseData } = useQuery({
    queryKey: ["discover-trends", scope, category, category === "region" ? regionPath : null],
    queryFn: () => fetchDiscoverBundle(scope, category, category === "region" ? regionPath : []),
    enabled: activeQuery.trim().length === 0,
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
    setCategory("all");
    setRegionPath([]);
    setExpandedSection(null);
    clearSearch();
  };

  // /planner's header shows whichever city was most recently scheduled/
  // opened from here — replaces what used to be a fixed "Fukuoka × Yufuin".
  const handleAddSpot = (spot: DiscoverSpot) => {
    setCurrentCity(cityFromRegion(spot.region, scope));
    setScheduleSpot(spotToPlace(spot));
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
    setCurrentCity(activeQuery.trim());
    setScheduleSpot(place);
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

  const trendingCompact = bundle?.trending.slice(0, COMPACT_SPOT_COUNT) ?? [];
  const favoritesCompact = bundle?.favorites.slice(0, COMPACT_SPOT_COUNT) ?? [];
  const routesCompact = bundle?.routes.slice(0, COMPACT_ROUTE_COUNT) ?? [];

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        {/* ── SEARCH + SEGMENTED TOGGLE ── */}
        <section className="mb-8">
          <div className="relative">
            <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
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
              placeholder="도시, 명소, 맛집을 검색해보세요 (예: 경주)"
              className="h-14 rounded-2xl border-slate-200 bg-white pl-12 pr-24 text-base shadow-sm shadow-slate-200/60 transition-shadow focus-visible:ring-2 focus-visible:ring-indigo-400"
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
                className="h-10 rounded-xl bg-indigo-600 px-4 text-[13px] font-semibold hover:bg-indigo-700"
              >
                검색
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

          <div className="mt-4 flex justify-center">
            <div className="relative inline-flex rounded-2xl bg-slate-100 p-1 shadow-inner">
              {SCOPES.map((s) => {
                const active = scope === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => handleScopeChange(s.key)}
                    className={`relative z-10 flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors sm:px-7 ${
                      active ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="scopePill"
                        className="absolute inset-0 -z-10 rounded-xl bg-white shadow-sm"
                        transition={{ type: "spring", stiffness: 500, damping: 34 }}
                      />
                    )}
                    <span className="text-base leading-none">{s.flag}</span>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {!isSearching && !expandedSection && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {CATEGORY_FILTERS.map((c) => {
                const active = category === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => {
                      setCategory(c.key);
                      setRegionPath([]);
                    }}
                    className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {c.key === "season" && "🍂 "}
                    {c.key === "hot" && "🔥 "}
                    {c.key === "region" && "📍 "}
                    {c.label}
                    {c.key === "season" && browseData?.season ? ` · ${SEASON_LABEL[browseData.season]}` : ""}
                  </button>
                );
              })}
            </div>
          )}

          {/* 최근 검색어 — 포커스 드롭다운과 별개로, 화면에 항상 보이는
              원탭 재검색 버튼 줄 (검색 전 브라우즈 화면에서만) */}
          {!isSearching && !expandedSection && recentSearches.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
              <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                <Clock size={12} /> 최근 검색
              </span>
              {recentSearches.map((r) => (
                <button
                  key={r.q}
                  onClick={() => runSearch(r.q, r.scope)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-600"
                >
                  {r.scope === "domestic" ? "🇰🇷 " : "🌐 "}
                  {r.q}
                </button>
              ))}
            </div>
          )}

          {/* 지역별 drill-down: 대륙→국가→도시 (overseas) / 시도→동네 (domestic) */}
          {!isSearching && !expandedSection && category === "region" && (
            <div className="mt-3 flex flex-col items-center gap-2">
              {regionPath.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <button
                    onClick={() => setRegionPath([])}
                    className="rounded-full bg-slate-100 px-3 py-1 text-[11.5px] font-medium text-slate-500 hover:bg-slate-200"
                  >
                    전체
                  </button>
                  {regionPath.map((label, i) => (
                    <button
                      key={label}
                      onClick={() => setRegionPath(regionPath.slice(0, i + 1))}
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
                      onClick={() => setRegionPath([...regionPath, node.label])}
                      className="rounded-full bg-slate-100 px-3 py-1 text-[11.5px] font-medium text-slate-500 hover:bg-slate-200"
                    >
                      {node.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {browseData?.notice === "coming_soon" && !expandedSection && (
          <div className="mb-6 rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-center text-[13px] text-amber-700">
            이 지역 데이터는 아직 준비 중이에요 — 대신 지금 가장 인기 있는 장소를 보여드려요.
          </div>
        )}

        {/* ── MAIN CONTENT ── */}
        {expandedSection && bundle ? (
          <ExpandedSection
            kind={expandedSection}
            bundle={bundle}
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
          /* ── BROWSE CONTENT (switches on scope + category) ── */
          <AnimatePresence mode="wait">
            <motion.div
              key={`${scope}-${category}-${regionPath.join("/")}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-12"
            >
              {bundle && bundle.trending.length > 0 && (
                <>
                  <SectionHeader
                    icon={category === "hot" ? Flame : category === "season" ? Sparkles : Flame}
                    iconClass="text-rose-500"
                    emoji={category === "season" ? "🍂" : "🔥"}
                    title={category === "hot" ? "지금 가장 핫한 장소" : category === "season" ? "이 계절 추천" : "지금 뜨는 장소"}
                    caption="지금 가장 많이 담긴 실시간 핫플"
                    onSeeAll={bundle.trending.length > COMPACT_SPOT_COUNT ? () => setExpandedSection("trending") : undefined}
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

              {bundle && bundle.favorites.length > 0 && (
                <>
                  <SectionHeader
                    icon={Crown}
                    iconClass="text-amber-500"
                    emoji="👑"
                    title="꾸준히 사랑받는 명소"
                    caption="언제 가도 좋은 스테디셀러 명소"
                    onSeeAll={bundle.favorites.length > COMPACT_SPOT_COUNT ? () => setExpandedSection("favorites") : undefined}
                  />
                  <div className="-mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                    {favoritesCompact.map((spot) => (
                      <SpotCard
                        key={spot.id}
                        spot={spot}
                        favorite
                        onAdd={() => handleAddSpot(spot)}
                        onOpenDetail={() => handleOpenDetail(spot)}
                      />
                    ))}
                  </div>
                </>
              )}

              {bundle && bundle.trending.length === 0 && bundle.favorites.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
                  이 조건에 맞는 장소가 아직 없어요.
                </div>
              )}

              {bundle && bundle.routes.length > 0 && (
                <>
                  <SectionHeader
                    icon={MapIcon}
                    iconClass="text-indigo-500"
                    emoji="🗺️"
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
      </div>

      {scheduleSpot && (
        <ScheduleModal
          place={scheduleSpot}
          initialDate={todayISODate()}
          isHourTaken={isHourTaken}
          mode="create"
          onClose={() => setScheduleSpot(null)}
          onConfirm={(date, hour, minute) => {
            addPlaces([scheduleSpot]);
            addItem({
              placeId: scheduleSpot.id,
              name: scheduleSpot.name,
              date,
              time: `${pad2(hour)}:${pad2(minute)}`,
              coordinates: { lat: scheduleSpot.lat, lng: scheduleSpot.lng },
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
              upsertSavedPlace(p);
              showToast(`${p.name} 관심 장소에 저장됨`);
              setDetailPlace(null);
            }}
            onSchedule={(p) => {
              setDetailPlace(null);
              setScheduleSpot(p);
            }}
          />
        </MapProvider>
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
  );
}

// ─────────────────────────────────────────────────────────────
function SectionHeader({
  icon: Icon,
  iconClass,
  emoji,
  title,
  caption,
  onSeeAll,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconClass: string;
  emoji: string;
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
          <h2 className="text-xl font-bold tracking-tight">
            <span className="mr-1">{emoji}</span>
            {title}
          </h2>
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
const SECTION_META: Record<SectionKind, { icon: React.ComponentType<{ size?: number; className?: string }>; iconClass: string; emoji: string; title: string }> = {
  trending: { icon: Flame, iconClass: "text-rose-500", emoji: "🔥", title: "지금 뜨는 장소" },
  favorites: { icon: Crown, iconClass: "text-amber-500", emoji: "👑", title: "꾸준히 사랑받는 명소" },
  routes: { icon: MapIcon, iconClass: "text-indigo-500", emoji: "🗺️", title: "추천 코스" },
};

function ExpandedSection({
  kind,
  bundle,
  onBack,
  onAddSpot,
  onOpenDetail,
  onPreviewRoute,
}: {
  kind: SectionKind;
  bundle: { trending: DiscoverSpot[]; favorites: DiscoverSpot[]; routes: DiscoverRoute[] };
  onBack: () => void;
  onAddSpot: (spot: DiscoverSpot) => void;
  onOpenDetail: (spot: DiscoverSpot) => void;
  onPreviewRoute: (route: DiscoverRoute) => void;
}) {
  const meta = SECTION_META[kind];
  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1 text-[13px] font-semibold text-slate-500 hover:text-slate-800">
        <ChevronLeft size={15} /> 뒤로
      </button>
      <div className="mb-6 flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 ${meta.iconClass}`}>
          <meta.icon size={17} />
        </span>
        <h2 className="text-xl font-bold tracking-tight">
          <span className="mr-1">{meta.emoji}</span>
          {meta.title}
        </h2>
      </div>
      {kind === "routes" ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {bundle.routes.map((route) => (
            <RouteTemplateCard key={route.id} route={route} onAdd={() => onPreviewRoute(route)} onPreview={() => onPreviewRoute(route)} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {(kind === "trending" ? bundle.trending : bundle.favorites).map((spot) => (
            <SpotCard key={spot.id} spot={spot} favorite={kind === "favorites"} onAdd={() => onAddSpot(spot)} onOpenDetail={() => onOpenDetail(spot)} />
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
  const { data: liveResults } = useQuery({
    queryKey: ["discover-live-search", scope, query, categoryFilter],
    queryFn: () => fetchLivePlaceSearch(scope, query, categoryFilter === "all" ? undefined : categoryFilter),
    // Each live call is real (billed) Google/Kakao quota — coming back to
    // the same search within a few minutes must reuse the cached results,
    // not re-bill the API.
    staleTime: 5 * 60 * 1000,
  });

  const [liveSort, setLiveSort] = useState<LiveSortKey>("relevance");
  // Which flag on the results map is highlighted — set by tapping either
  // the flag itself or a card in the list below, so both always point at
  // the same place.
  const [selectedLiveId, setSelectedLiveId] = useState<string | null>(null);
  const sortedLiveResults = useMemo(() => {
    if (!liveResults) return [];
    if (liveSort === "rating") return [...liveResults].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    if (liveSort === "reviews") return [...liveResults].sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
    return liveResults;
  }, [liveResults, liveSort]);

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

  if (routes.length === 0 && total === 0 && !isRefetching && !hasLiveResults) {
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
      {hasLiveResults && page === 1 && (
        <section>
          <SectionHeader
            icon={Search}
            iconClass="text-emerald-500"
            emoji="🔎"
            title={`"${query}" 실시간 검색 결과`}
            caption={scope === "overseas" ? "Google 지도 기준 실제 장소 · 평점" : "카카오맵 기준 실제 장소"}
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {LIVE_SORTS.map((s) => {
              const active = liveSort === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setLiveSort(s.key)}
                  className={`rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors ${
                    active ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {/* 검색된 가게들이 플래그로 찍힌 결과 지도 — 플래그 탭 = 요약
              팝업(메뉴 링크·상세), 아래 목록 카드 탭 = 해당 플래그 선택 */}
          <MapProvider>
            <div className="mt-4 h-72 overflow-hidden rounded-2xl border border-slate-200 shadow-sm sm:h-80">
              <LiveResultsMap
                places={sortedLiveResults}
                selectedId={selectedLiveId}
                onSelect={setSelectedLiveId}
                onOpenDetail={onOpenLiveDetail}
              />
            </div>
          </MapProvider>

          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {sortedLiveResults.map((place) => (
              <LivePlaceCard
                key={place.id}
                place={place}
                onAdd={() => onAddLivePlace(place)}
                onOpenDetail={() => {
                  setSelectedLiveId(place.id);
                  onOpenLiveDetail(place);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {routes.length > 0 && page === 1 && (
        <section>
          <SectionHeader icon={Crown} iconClass="text-amber-500" emoji="🏆" title={`"${query}" 인기 루트`} caption="좋아요 · 조회수가 높은 여행자들의 루트" />
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
            emoji="📍"
            title={`"${query}" 카테고리별 장소`}
            caption="원하는 카테고리를 골라 맛집·숙소까지 찾아보세요"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {SEARCH_CATEGORY_FILTERS.map((c) => {
              const active = categoryFilter === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => handleCategoryClick(c.key)}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
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
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {CUISINE_FILTERS.map((c) => {
                const active = cuisineFilter === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => handleCuisineClick(c.key)}
                    className={`rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors ${
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
  favorite,
  onAdd,
  onOpenDetail,
}: {
  spot: DiscoverSpot;
  rank?: number;
  favorite?: boolean;
  onAdd: () => void;
  onOpenDetail: () => void;
}) {
  const Icon = SPOT_ICONS[spot.iconKey];
  // Representative photo resolved live by name+city (see
  // /api/discover/spot-photo) — 404/no-key/no-match just falls back to
  // the curated gradient, so the card never shows a broken image.
  const [photoFailed, setPhotoFailed] = useState(false);
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
          <MapPin size={11} /> {spot.region}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            {favorite ? (
              <Star size={12} className="text-amber-400" />
            ) : (
              <TrendingUp size={12} className="text-rose-500" />
            )}
            {fmt(spot.saves)}명 저장
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-indigo-500 hover:text-white"
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
function LivePlaceCard({ place, onAdd, onOpenDetail }: { place: Place; onAdd: () => void; onOpenDetail: () => void }) {
  return (
    <div
      onClick={onOpenDetail}
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
        ) : (
          <>
            <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_30%_20%,white,transparent_40%)]" />
            <MapPin size={26} className="text-white/90" />
          </>
        )}
        <div className="absolute right-2 top-2">
          <Badge className="border-none bg-white/85 text-[10px] font-semibold text-slate-700 backdrop-blur">
            {liveTypeLabel(place.category)}
          </Badge>
        </div>
      </div>
      <div className="px-3 pb-3 pt-3">
        <p className="truncate text-sm font-bold text-slate-900">{place.name}</p>
        {place.address && (
          <p className="mt-0.5 line-clamp-1 flex items-center gap-1 text-[11px] text-slate-500">
            <MapPin size={11} /> {place.address}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-1">
          {place.rating != null ? (
            <span className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-slate-600">
              <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />
              {place.rating.toFixed(1)}
              {place.reviewCount != null && (
                <span className="truncate font-normal text-slate-400">· 리뷰 {fmt(place.reviewCount)}</span>
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
                className="flex h-7 items-center gap-1 rounded-full bg-slate-100 px-2 text-[10.5px] font-semibold text-slate-500 transition-colors hover:bg-emerald-500 hover:text-white"
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
          <span className="text-white/70">by {route.author}</span>
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
