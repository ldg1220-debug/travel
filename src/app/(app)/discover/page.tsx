"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useItineraryStore } from "@/store/itineraryStore";
import type { Place, PlaceIcon } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// Dummy data (국내 🇰🇷 / 국외 🌐)
// ─────────────────────────────────────────────────────────────
type Scope = "domestic" | "overseas";

type SpotIcon = React.ComponentType<{ size?: number; className?: string }>;

type Spot = {
  id: string;
  name: string;
  region: string;
  tag: string;
  saves: number;
  gradient: string;
  icon: SpotIcon;
  // Real coordinates + a solid accent color, so the "[+]" button can push
  // this spot into the itinerary store as a genuine Place (see
  // spotToPlace below) — the store only understands real Place shapes,
  // not this page's purely-visual gradient/icon-component fields.
  lat: number;
  lng: number;
  color: string;
};

type RouteStop = { time: string; name: string; lat: number; lng: number };
type RouteCard = {
  id: string;
  title: string;
  subtitle: string;
  region: string;
  duration: string;
  gradient: string;
  stops: RouteStop[];
};

type Bundle = {
  trending: Spot[];
  favorites: Spot[];
  routes: RouteCard[];
};

const DATA: Record<Scope, Bundle> = {
  domestic: {
    trending: [
      { id: "d-t1", name: "애월 감성 카페거리", region: "제주 · 애월", tag: "카페", saves: 1240, gradient: "from-rose-400 to-orange-300", icon: Coffee, lat: 33.4623, lng: 126.3096, color: "#fb7185" },
      { id: "d-t2", name: "성수동 팝업 스트리트", region: "서울 · 성수", tag: "핫플", saves: 980, gradient: "from-violet-400 to-fuchsia-300", icon: Camera, lat: 37.5445, lng: 127.0557, color: "#a78bfa" },
      { id: "d-t3", name: "해운대 블루라인 파크", region: "부산 · 해운대", tag: "바다", saves: 872, gradient: "from-sky-400 to-cyan-300", icon: Waves, lat: 35.1587, lng: 129.1604, color: "#38bdf8" },
      { id: "d-t4", name: "익선동 한옥골목", region: "서울 · 종로", tag: "골목", saves: 640, gradient: "from-amber-400 to-yellow-300", icon: Landmark, lat: 37.573, lng: 126.991, color: "#fbbf24" },
    ],
    favorites: [
      { id: "d-f1", name: "경복궁", region: "서울 · 종로", tag: "궁궐", saves: 5200, gradient: "from-emerald-400 to-teal-300", icon: Landmark, lat: 37.5796, lng: 126.977, color: "#34d399" },
      { id: "d-f2", name: "성산일출봉", region: "제주 · 서귀포", tag: "자연", saves: 4800, gradient: "from-lime-400 to-green-300", icon: Waves, lat: 33.4586, lng: 126.9425, color: "#a3e635" },
      { id: "d-f3", name: "광장시장 먹자골목", region: "서울 · 종로", tag: "맛집", saves: 4100, gradient: "from-orange-400 to-red-300", icon: UtensilsCrossed, lat: 37.5701, lng: 126.9997, color: "#fb923c" },
      { id: "d-f4", name: "감천문화마을", region: "부산 · 사하", tag: "포토", saves: 3600, gradient: "from-pink-400 to-rose-300", icon: Camera, lat: 35.0975, lng: 129.0107, color: "#f472b6" },
    ],
    routes: [
      {
        id: "d-r1",
        title: "서울 종로 근본 투어",
        subtitle: "궁궐부터 시장까지, 하루 완주 코스",
        region: "서울",
        duration: "당일치기 · 4곳",
        gradient: "from-emerald-500 to-teal-400",
        stops: [
          { time: "10:00", name: "경복궁", lat: 37.5796, lng: 126.977 },
          { time: "13:00", name: "광장시장", lat: 37.5701, lng: 126.9997 },
          { time: "15:30", name: "익선동 한옥골목", lat: 37.573, lng: 126.991 },
          { time: "18:00", name: "청계천 야경", lat: 37.5696, lng: 126.9784 },
        ],
      },
      {
        id: "d-r2",
        title: "제주 애월 감성 드라이브",
        subtitle: "바다 뷰 카페와 노을 명소",
        region: "제주",
        duration: "당일치기 · 3곳",
        gradient: "from-sky-500 to-cyan-400",
        stops: [
          { time: "11:00", name: "애월 카페거리", lat: 33.4623, lng: 126.3096 },
          { time: "14:00", name: "협재해수욕장", lat: 33.3937, lng: 126.2394 },
          { time: "18:30", name: "곽지 노을 스팟", lat: 33.4498, lng: 126.2989 },
        ],
      },
    ],
  },
  overseas: {
    trending: [
      { id: "o-t1", name: "도톤보리 글리코 사인", region: "일본 · 오사카", tag: "핫플", saves: 3120, gradient: "from-fuchsia-400 to-pink-300", icon: Camera, lat: 34.6688, lng: 135.5019, color: "#e879f9" },
      { id: "o-t2", name: "유후인 플로랄 빌리지", region: "일본 · 오이타", tag: "감성", saves: 2540, gradient: "from-rose-400 to-amber-300", icon: Landmark, lat: 33.2668, lng: 131.3717, color: "#fb7185" },
      { id: "o-t3", name: "하노이 구시가지 나이트", region: "베트남 · 하노이", tag: "야시장", saves: 1980, gradient: "from-amber-400 to-orange-300", icon: UtensilsCrossed, lat: 21.0343, lng: 105.8508, color: "#fbbf24" },
      { id: "o-t4", name: "캐널시티 하카타", region: "일본 · 후쿠오카", tag: "쇼핑", saves: 1670, gradient: "from-cyan-400 to-blue-300", icon: MapPin, lat: 33.5898, lng: 130.4103, color: "#22d3ee" },
    ],
    favorites: [
      { id: "o-f1", name: "오사카성", region: "일본 · 오사카", tag: "명소", saves: 8900, gradient: "from-teal-400 to-emerald-300", icon: Landmark, lat: 34.6873, lng: 135.5259, color: "#2dd4bf" },
      { id: "o-f2", name: "이치란 라멘 본점", region: "일본 · 후쿠오카", tag: "맛집", saves: 7300, gradient: "from-red-400 to-orange-300", icon: UtensilsCrossed, lat: 33.5958, lng: 130.409, color: "#f87171" },
      { id: "o-f3", name: "호안끼엠 호수", region: "베트남 · 하노이", tag: "자연", saves: 6100, gradient: "from-green-400 to-lime-300", icon: Waves, lat: 21.0285, lng: 105.8524, color: "#4ade80" },
      { id: "o-f4", name: "나라 사슴공원", region: "일본 · 나라", tag: "힐링", saves: 5400, gradient: "from-yellow-400 to-amber-300", icon: Camera, lat: 34.6851, lng: 135.843, color: "#facc15" },
    ],
    routes: [
      {
        id: "o-r1",
        title: "오사카 당일치기 먹방 코스",
        subtitle: "타코야키부터 라멘까지 위장 투어",
        region: "오사카",
        duration: "당일치기 · 4곳",
        gradient: "from-rose-500 to-orange-400",
        stops: [
          { time: "11:00", name: "쿠로몬 시장", lat: 34.6656, lng: 135.5065 },
          { time: "13:30", name: "도톤보리 타코야키", lat: 34.6688, lng: 135.5019 },
          { time: "16:00", name: "신세카이 쿠시카츠", lat: 34.6524, lng: 135.5063 },
          { time: "19:00", name: "우메다 라멘 골목", lat: 34.7024, lng: 135.4959 },
        ],
      },
      {
        id: "o-r2",
        title: "후쿠오카-유후인 핵심 동선",
        subtitle: "텐진 도심부터 유후인 료칸까지",
        region: "후쿠오카",
        duration: "1박 2일 · 4곳",
        gradient: "from-violet-500 to-fuchsia-400",
        stops: [
          { time: "09:00", name: "Tenjin Airbnb (숙소)", lat: 33.5904, lng: 130.3986 },
          { time: "11:00", name: "Clio Court (클리오 코트)", lat: 33.5895, lng: 130.4207 },
          { time: "15:00", name: "Yufuin Floral Village", lat: 33.2668, lng: 131.3717 },
          { time: "18:00", name: "Yufuin Ryokan", lat: 33.2646, lng: 131.3572 },
        ],
      },
    ],
  },
};

const SCOPES: { key: Scope; label: string; flag: string }[] = [
  { key: "domestic", label: "국내 여행", flag: "🇰🇷" },
  { key: "overseas", label: "해외 여행", flag: "🌐" },
];

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// Maps this page's purely-visual lucide icon components onto the store's
// PlaceIcon string enum (src/lib/types.ts) — the closest semantic match
// for each, since the two aren't the same set of icons.
const SPOT_ICON_TO_PLACE_ICON = new Map<SpotIcon, PlaceIcon>([
  [Coffee, "coffee"],
  [Camera, "camera"],
  [Waves, "boat"],
  [Landmark, "museum"],
  [UtensilsCrossed, "utensils"],
  [MapPin, "pin"],
]);

function spotToPlace(spot: Spot): Place {
  return {
    id: spot.id,
    placeId: spot.id,
    name: spot.name,
    category: spot.tag,
    color: spot.color,
    lat: spot.lat,
    lng: spot.lng,
    icon: SPOT_ICON_TO_PLACE_ICON.get(spot.icon) ?? "pin",
  };
}

function routeStopToPlace(routeId: string, stop: RouteStop): Place {
  const slug = stop.name.replace(/[^a-zA-Z0-9가-힣]+/g, "-");
  const id = `${routeId}-${slug}`;
  return {
    id,
    placeId: id,
    name: stop.name,
    category: "Route stop",
    color: "#818cf8",
    lat: stop.lat,
    lng: stop.lng,
    icon: "pin",
  };
}

// ─────────────────────────────────────────────────────────────
// The global App Bar (hamburger + title + Sheet nav) already lives in
// src/components/AppBar.tsx, rendered once by src/app/(app)/layout.tsx
// above every screen in this group — this page owns only the content
// below it, not another header.
export default function DiscoverPage() {
  const router = useRouter();
  const addPlace = useItineraryStore((s) => s.addPlace);
  const addPlaces = useItineraryStore((s) => s.addPlaces);
  const addRouteBundle = useItineraryStore((s) => s.addRouteBundle);

  const [scope, setScope] = useState<Scope>("domestic");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bundle = DATA[scope];

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  const handleAddSpot = (spot: Spot) => {
    addPlace(spotToPlace(spot));
    showToast("일정에 추가되었습니다.");
  };

  // Tapping the card itself (not the [+] quick-add button) hands off to
  // /planner's 딥 다이브 detail overlay instead of scheduling immediately —
  // no map provider lives on this screen, so the place just needs to be
  // findable-by-id once /planner mounts (see its ?openDetail effect).
  const handleOpenDetail = (spot: Spot) => {
    addPlaces([spotToPlace(spot)]);
    router.push(`/planner?openDetail=${encodeURIComponent(spot.id)}`);
  };

  // Pushes every stop into the store's schedule in order, then jumps to
  // /planner so the trip the user just grabbed is immediately visible on
  // the map + timeline — addRouteBundle is a synchronous Zustand update,
  // so by the time router.push runs the data is already there to render.
  const handleAddRoute = (route: RouteCard) => {
    addRouteBundle(route.stops.map((stop) => routeStopToPlace(route.id, stop)));
    showToast("일정에 추가되었습니다.");
    router.push("/planner");
  };

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        {/* ── SEARCH + SEGMENTED TOGGLE ── */}
        <section className="mb-10">
          <div className="relative">
            <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="도시, 명소, 맛집을 검색해보세요"
              className="h-14 rounded-2xl border-slate-200 bg-white pl-12 pr-4 text-base shadow-sm shadow-slate-200/60 transition-shadow focus-visible:ring-2 focus-visible:ring-indigo-400"
            />
          </div>

          <div className="mt-4 flex justify-center">
            <div className="relative inline-flex rounded-2xl bg-slate-100 p-1 shadow-inner">
              {SCOPES.map((s) => {
                const active = scope === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setScope(s.key)}
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
        </section>

        {/* ── CONTENT (switches on scope) ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={scope}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-12"
          >
            {/* ① Trending Now */}
            <SectionHeader
              icon={Flame}
              iconClass="text-rose-500"
              emoji="🔥"
              title="Trending Now"
              caption="지금 가장 많이 담긴 실시간 핫플"
            />
            <div className="-mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {bundle.trending.map((spot, i) => (
                <SpotCard
                  key={spot.id}
                  spot={spot}
                  rank={i + 1}
                  onAdd={() => handleAddSpot(spot)}
                  onOpenDetail={() => handleOpenDetail(spot)}
                />
              ))}
            </div>

            {/* ② All-Time Favorites */}
            <SectionHeader
              icon={Crown}
              iconClass="text-amber-500"
              emoji="👑"
              title="All-Time Favorites"
              caption="언제 가도 좋은 스테디셀러 명소"
            />
            <div className="-mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {bundle.favorites.map((spot) => (
                <SpotCard
                  key={spot.id}
                  spot={spot}
                  favorite
                  onAdd={() => handleAddSpot(spot)}
                  onOpenDetail={() => handleOpenDetail(spot)}
                />
              ))}
            </div>

            {/* ③ Recommended Routes */}
            <SectionHeader
              icon={MapIcon}
              iconClass="text-indigo-500"
              emoji="🗺️"
              title="Recommended Routes"
              caption="장소를 묶어둔 추천 코스 템플릿"
            />
            <div className="-mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              {bundle.routes.map((route) => (
                <RouteTemplateCard key={route.id} route={route} onAdd={() => handleAddRoute(route)} />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

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
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconClass: string;
  emoji: string;
  title: string;
  caption: string;
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
      <button className="flex items-center gap-0.5 text-[13px] font-semibold text-slate-400 transition-colors hover:text-slate-700">
        전체보기 <ChevronRight size={15} />
      </button>
    </div>
  );
}

// ── spot card (trending / favorites) ──
function SpotCard({
  spot,
  rank,
  favorite,
  onAdd,
  onOpenDetail,
}: {
  spot: Spot;
  rank?: number;
  favorite?: boolean;
  onAdd: () => void;
  onOpenDetail: () => void;
}) {
  const Icon = spot.icon;
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

// ── route template card ──
function RouteTemplateCard({ route, onAdd }: { route: RouteCard; onAdd: () => void }) {
  return (
    <div className="group overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm transition-all hover:shadow-xl hover:shadow-slate-200">
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
          <span className="text-[12px] text-slate-400">코스 그대로 담기</span>
          <Button
            onClick={onAdd}
            className="h-9 gap-1 rounded-full bg-indigo-600 px-4 text-[13px] font-semibold text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-700"
          >
            <Plus size={15} />내 일정에 담기
          </Button>
        </div>
      </div>
    </div>
  );
}
