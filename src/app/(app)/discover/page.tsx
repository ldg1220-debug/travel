"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { GoogleMap, OverlayView, Polyline } from "@react-google-maps/api";
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
  ChevronRight,
  ChevronLeft,
  Sparkles,
  CalendarRange,
  Heart,
  Eye,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScheduleModal } from "@/components/ScheduleModal";
import { MonthCalendar } from "@/components/MonthCalendar";
import { MapProvider, useGoogleMapsStatus } from "@/app/(app)/planner/MapProvider";
import { useItineraryStore } from "@/store/itineraryStore";
import { fetchDiscoverBundle, fetchDiscoverSearch } from "@/lib/api";
import { formatDateLabelShort, hourFromTime, pad2, todayISODate, TIMELINE_HOURS } from "@/lib/timeline";
import { SEASON_LABEL } from "@/lib/discoverData";
import type {
  DiscoverRoute,
  DiscoverRouteStop,
  DiscoverScope,
  DiscoverSpot,
  PlaceCategoryTag,
  RegionNode,
  SpotIconKey,
} from "@/lib/discoverData";
import type { Place, PlaceIcon } from "@/lib/types";

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
};

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

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
  return { id, placeId: id, name: stop.name, category: "Route stop", color: "#818cf8", lat: stop.lat, lng: stop.lng, icon: "pin" };
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

  const [scope, setScope] = useState<DiscoverScope>("domestic");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [regionPath, setRegionPath] = useState<string[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [scheduleSpot, setScheduleSpot] = useState<Place | null>(null);
  const [routeTarget, setRouteTarget] = useState<DiscoverRoute | null>(null);
  const [previewRoute, setPreviewRoute] = useState<DiscoverRoute | null>(null);
  const [expandedSection, setExpandedSection] = useState<SectionKind | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── search: only runs once the user actually submits (Enter / button) ──
  const { data: searchData, isFetching: searching } = useQuery({
    queryKey: ["discover-search", scope, activeQuery],
    queryFn: () => fetchDiscoverSearch(scope, activeQuery),
    enabled: activeQuery.trim().length > 0,
  });

  const isSearching = activeQuery.trim().length > 0;
  const bundle = browseData?.bundle;
  const regionTree = browseData?.regionTree ?? [];
  const regionOptions = nodesAtPath(regionTree, regionPath);

  const runSearch = () => setActiveQuery(queryInput);
  const clearSearch = () => {
    setQueryInput("");
    setActiveQuery("");
  };

  const handleScopeChange = (next: DiscoverScope) => {
    setScope(next);
    setCategory("all");
    setRegionPath([]);
    setExpandedSection(null);
    clearSearch();
  };

  // Grouped-by-category place list for search results (관광지 / 테마파크 / 음식점 / 술집 / 박물관 …).
  const groupedSearchSpots = useMemo(() => {
    const spots = searchData?.results.spots ?? [];
    const groups = new Map<PlaceCategoryTag, DiscoverSpot[]>();
    for (const spot of spots) {
      const list = groups.get(spot.tag) ?? [];
      list.push(spot);
      groups.set(spot.tag, list);
    }
    return Array.from(groups.entries());
  }, [searchData]);

  const popularRoutes = searchData?.results.routes ?? [];

  const handleAddSpot = (spot: DiscoverSpot) => setScheduleSpot(spotToPlace(spot));

  // Tapping the card itself (not the [+] quick-add button) hands off to
  // /planner's 딥 다이브 detail overlay instead of scheduling immediately.
  const handleOpenDetail = (spot: DiscoverSpot) => {
    addPlaces([spotToPlace(spot)]);
    router.push(`/planner?openDetail=${encodeURIComponent(spot.id)}`);
  };

  const handleAddRoute = (route: DiscoverRoute) => {
    setPreviewRoute(null);
    setRouteTarget(route);
  };

  const confirmRouteAdd = (date: string) => {
    if (!routeTarget) return;
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
                  aria-label="Clear search"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
              <Button
                onClick={runSearch}
                disabled={!queryInput.trim()}
                className="h-10 rounded-xl bg-indigo-600 px-4 text-[13px] font-semibold hover:bg-indigo-700"
              >
                검색
              </Button>
            </div>
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
            query={activeQuery}
            searching={searching}
            routes={popularRoutes}
            groupedSpots={groupedSearchSpots}
            onAddSpot={handleAddSpot}
            onOpenDetail={handleOpenDetail}
            onPreviewRoute={setPreviewRoute}
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
                    title={category === "hot" ? "Hottest Right Now" : category === "season" ? "이 계절 추천" : "Trending Now"}
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
                    title="All-Time Favorites"
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
                    title="Recommended Routes"
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
  trending: { icon: Flame, iconClass: "text-rose-500", emoji: "🔥", title: "Trending Now" },
  favorites: { icon: Crown, iconClass: "text-amber-500", emoji: "👑", title: "All-Time Favorites" },
  routes: { icon: MapIcon, iconClass: "text-indigo-500", emoji: "🗺️", title: "Recommended Routes" },
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

// ── search results: popular routes ranked by likes + category-grouped places ──
function SearchResults({
  query,
  searching,
  routes,
  groupedSpots,
  onAddSpot,
  onOpenDetail,
  onPreviewRoute,
}: {
  query: string;
  searching: boolean;
  routes: DiscoverRoute[];
  groupedSpots: [PlaceCategoryTag, DiscoverSpot[]][];
  onAddSpot: (spot: DiscoverSpot) => void;
  onOpenDetail: (spot: DiscoverSpot) => void;
  onPreviewRoute: (route: DiscoverRoute) => void;
}) {
  if (searching) {
    return <div className="py-20 text-center text-sm text-slate-400">&ldquo;{query}&rdquo; 검색 중…</div>;
  }
  if (routes.length === 0 && groupedSpots.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
        <p className="text-sm text-slate-500">&ldquo;{query}&rdquo;에 대한 결과가 없어요.</p>
        <p className="mt-1 text-[12px] text-slate-400">다른 지역이나 명소 이름으로 검색해보세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {routes.length > 0 && (
        <section>
          <SectionHeader icon={Crown} iconClass="text-amber-500" emoji="🏆" title={`"${query}" 인기 루트`} caption="좋아요 · 조회수가 높은 여행자들의 루트" />
          <div className="-mt-6 mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
            {routes.map((route) => (
              <RouteTemplateCard key={route.id} route={route} onAdd={() => onPreviewRoute(route)} onPreview={() => onPreviewRoute(route)} />
            ))}
          </div>
        </section>
      )}

      {groupedSpots.length > 0 && (
        <section>
          <SectionHeader icon={MapIcon} iconClass="text-indigo-500" emoji="📍" title={`"${query}" 카테고리별 장소`} caption="관광지 · 테마파크 · 음식점 · 술집 · 박물관" />
          <div className="mt-4 space-y-8">
            {groupedSpots.map(([tag, spots]) => {
              const TagIcon = CATEGORY_ICONS[tag];
              return (
                <div key={tag}>
                  <div className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-slate-700">
                    <TagIcon size={14} className="text-slate-400" />
                    {tag}
                    <span className="text-[11px] font-medium text-slate-400">{spots.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {spots.map((spot) => (
                      <SpotCard key={spot.id} spot={spot} onAdd={() => onAddSpot(spot)} onOpenDetail={() => onOpenDetail(spot)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
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
  return (
    <div
      onClick={onOpenDetail}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200"
    >
      <div className={`relative h-28 bg-gradient-to-br ${spot.gradient}`}>
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_30%_20%,white,transparent_40%)]" />
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
          <div className="relative h-56 shrink-0 bg-[#eef2f4]">
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

function RoutePreviewMap({ stops }: { stops: DiscoverRouteStop[] }) {
  const { isLoaded, loadError } = useGoogleMapsStatus();
  if (loadError) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-400">지도를 불러오지 못했어요.</div>;
  }
  if (!isLoaded) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-400">지도 로딩 중…</div>;
  }
  const center = stops[Math.floor(stops.length / 2)];
  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={{ lat: center.lat, lng: center.lng }}
      zoom={12}
      onLoad={(map) => {
        const bounds = new google.maps.LatLngBounds();
        stops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
        map.fitBounds(bounds, 40);
      }}
      options={{ disableDefaultUI: true, gestureHandling: "greedy" }}
    >
      <Polyline
        path={stops.map((s) => ({ lat: s.lat, lng: s.lng }))}
        options={{ strokeColor: "#4f46e5", strokeOpacity: 0.9, strokeWeight: 3 }}
      />
      {stops.map((s, i) => (
        <OverlayView key={i} position={{ lat: s.lat, lng: s.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
          <div className="flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-[11px] font-bold text-white shadow">
            {i + 1}
          </div>
        </OverlayView>
      ))}
    </GoogleMap>
  );
}

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
          <button onClick={onClose} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label="Close">
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
