"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { Button } from "@/components/ui/button";
import { useGoogleMapsStatus, useKakaoMapsStatus } from "./MapProvider";
import { useItineraryStore } from "@/store/itineraryStore";
import { haversineDistanceMeters } from "@/lib/geo";
import { isDomesticCoordinate } from "@/lib/maps/regionForCoords";
import { fetchPlaceDetails, type PlaceDetails } from "@/lib/api";
import { PlaceGlyph } from "./icons";
import { Pin } from "./MapMarkers";
import type { Place } from "@/lib/types";

// Always client-only — see PlaceMiniMap.tsx / lib/maps/mapResize.ts.
const PlaceMiniMap = dynamic(() => import("./PlaceMiniMap"), { ssr: false });

/** How far around the open place counts as "nearby" for the mini map's secondary pins — a same-neighborhood radius, not the whole city. */
const NEARBY_RADIUS_METERS = 5000;
const MAX_NEARBY_PINS = 6;

// Exported so /saved-places can reuse the same set for its category filter
// chips and inline category editor — one source of truth for what a saved
// place's `category` field is allowed to be set to from the UI.
export const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "Cafe", label: "카페" },
  { value: "Restaurant", label: "음식점" },
  { value: "Attraction", label: "관광지" },
  { value: "Lodging", label: "숙소" },
  { value: "Museum", label: "박물관" },
  { value: "Park", label: "공원" },
];

/** A live Google place (has a real place_id / maps link) — only these can fetch reviews+photos. Curated seed spots (ids like "d-f10") and Kakao numeric ids can't. */
function isLiveGooglePlace(place: Place): boolean {
  return Boolean(place.googleMapsUri) || /^[A-Za-z0-9_-]{20,}$/.test(place.placeId);
}

interface PlaceDetailOverlayProps {
  /** null = closed. Doubles as both "add new" (from search/trends) and "edit existing" (from the saved list) — upsertSavedPlace on the store handles both uniformly. */
  place: Place | null;
  onClose: () => void;
  onSave: (place: Place) => void;
  /** Present only when there's somewhere meaningful to schedule it (an activeDate) — renders a second "일정에 추가" action. */
  onSchedule?: (place: Place) => void;
}

/**
 * "딥 다이브" detail overlay — a bottom sheet over whatever the planner
 * tab underneath was showing, so switching tabs/dates while it's open
 * isn't possible and closing it always returns to the exact same state.
 * Mini map reuses the same MapProvider-loaded SDK as the main planner
 * map (no second script load).
 */
export function PlaceDetailOverlay({ place, onClose, onSave, onSchedule }: PlaceDetailOverlayProps) {
  const { isLoaded: googleLoaded } = useGoogleMapsStatus();
  const { isLoaded: kakaoLoaded } = useKakaoMapsStatus();
  const mapsLoaded = place ? (isDomesticCoordinate(place.lat, place.lng) ? kakaoLoaded : googleLoaded) : false;
  const savedPlaces = useItineraryStore((s) => s.savedPlaces);

  // Other 관심 장소 within a short walk/ride of the one being viewed — gives
  // the mini map actual geographic context ("what else is around here")
  // instead of an isolated pin with nothing else on screen.
  const nearbyPlaces = place
    ? savedPlaces
        .filter((p) => p.id !== place.id && haversineDistanceMeters(place, p) <= NEARBY_RADIUS_METERS)
        .slice(0, MAX_NEARBY_PINS)
    : [];

  return (
    <AnimatePresence>
      {place && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative flex max-h-[88%] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            {/* header — 실제 업체 사진이 있으면 사진(위치 맥락은 뒤의 결과
                지도가 담당), 없으면 기존 미니맵 */}
            <div className="relative h-40 w-full shrink-0 bg-[#eef2f4]">
              {place.photoName ? (
                // eslint-disable-next-line @next/next/no-img-element -- served via our own /api/places/photo redirect proxy; see LivePlaceCard
                <img
                  src={`/api/places/photo?name=${encodeURIComponent(place.photoName)}&w=800`}
                  alt={place.name}
                  className="h-full w-full object-cover"
                />
              ) : mapsLoaded ? (
                <PlaceMiniMap place={place} nearbyPlaces={nearbyPlaces} />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">지도 로딩 중…</div>
              )}
              {!place.photoName && (
                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-lg">
                  <Pin place={place} solid />
                </div>
              )}
              <button
                onClick={onClose}
                aria-label="닫기"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow"
              >
                <X size={14} color="#64748b" />
              </button>
            </div>

            {/* Keyed on place.id so switching to a different place (without
                the overlay ever fully closing) resets the form's local
                state via remount, instead of syncing it from a prop effect. */}
            <PlaceDetailForm key={place.id} place={place} onSave={onSave} onSchedule={onSchedule} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface PlaceDetailFormProps {
  place: Place;
  onSave: (place: Place) => void;
  onSchedule?: (place: Place) => void;
}

function PlaceDetailForm({ place, onSave, onSchedule }: PlaceDetailFormProps) {
  const [category, setCategory] = useState(place.category);
  const [memo, setMemo] = useState(place.memo ?? "");
  // Which gallery photo is open full-screen — null = lightbox closed.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Review text is clamped to 4 lines by default; toggled open per-review
  // by index instead of a single flag, so expanding one doesn't expand all.
  const [expandedReviews, setExpandedReviews] = useState<Set<number>>(new Set());
  const toggleReviewExpanded = (i: number) =>
    setExpandedReviews((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Google reviews + photo gallery — the in-app menu-tab substitute. Only
  // fetched for live Google places; null while loading or when unavailable.
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  useEffect(() => {
    if (!isLiveGooglePlace(place)) return;
    let alive = true;
    fetchPlaceDetails(place.placeId).then((d) => {
      if (alive) setDetails(d);
    });
    return () => {
      alive = false;
    };
  }, [place]);

  const gallery = details?.photoNames ?? (place.photoName ? [place.photoName] : []);
  const reviews = details?.reviews ?? [];

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `${place.color}1A`, border: `1px solid ${place.color}33` }}
        >
          <PlaceGlyph icon={place.icon} size={20} color={place.color} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-tight text-slate-900">{place.name}</p>
          <p className="truncate text-[12px] text-slate-500">{place.address ?? place.category}</p>
        </div>
      </div>

      {(place.rating != null || details?.openNow != null) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
          {place.rating != null && (
            <span className="flex items-center gap-1 font-semibold text-slate-700">
              <CordixIcon name="star" size={12} stroke="#fbbf24" accent="#fbbf24" />
              {place.rating.toFixed(1)}
              {place.reviewCount != null && <span className="font-normal text-slate-400">· 리뷰 {place.reviewCount.toLocaleString()}</span>}
            </span>
          )}
          {details?.openNow != null && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${details.openNow ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
              {details.openNow ? "영업 중" : "영업 종료"}
            </span>
          )}
        </div>
      )}

      {/* 사진 갤러리 — 실제 업체·음식 사진 (구글 Places 사진 프록시). 탭하면
          더 크게 볼 수 있는 라이트박스가 열린다. */}
      {gallery.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {gallery.map((name, i) => (
            <button key={name} onClick={() => setLightboxIndex(i)} className="shrink-0" aria-label={`${place.name} 사진 크게 보기`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- served via /api/places/photo redirect proxy */}
              <img
                src={`/api/places/photo?name=${encodeURIComponent(name)}&w=400`}
                alt={place.name}
                loading="lazy"
                className="h-24 w-32 rounded-xl object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {lightboxIndex != null && (
        <PhotoLightbox
          photoNames={gallery}
          index={lightboxIndex}
          alt={place.name}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      {place.googleMapsUri && (
        <a
          href={place.googleMapsUri}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <ExternalLink size={12} /> 구글맵에서 메뉴판·전체 리뷰 보기
        </a>
      )}

      {/* 리뷰 — 구글 리뷰 최대 5개 (앱 안에서 바로 확인) */}
      {reviews.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">리뷰</p>
          <div className="space-y-2.5">
            {reviews.map((r, i) => (
              <div key={i} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-slate-700">{r.author}</span>
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    {r.rating != null && <CordixIcon name="star" size={10} stroke="#fbbf24" accent="#fbbf24" />}
                    {r.rating != null && r.rating}
                    {r.when && <span className="text-slate-400">· {r.when}</span>}
                  </span>
                </div>
                {r.text && (
                  <>
                    <p
                      className={`mt-1 text-[12px] leading-relaxed text-slate-600 ${expandedReviews.has(i) ? "" : "line-clamp-4"}`}
                    >
                      {r.text}
                    </p>
                    {r.text.length > 140 && (
                      <button
                        onClick={() => toggleReviewExpanded(i)}
                        className="mt-0.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                      >
                        {expandedReviews.has(i) ? "접기" : "더보기"}
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wide text-slate-500">카테고리</p>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_OPTIONS.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              category === c.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <label className="mb-2 mt-4 block text-[11px] font-medium uppercase tracking-wide text-slate-500">메모</label>
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="이 장소에 대한 메모를 남겨보세요"
        rows={3}
        className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400"
      />

      <div className="mt-5 flex gap-2">
        <Button
          onClick={() => onSave({ ...place, category, memo: memo.trim() || undefined })}
          className="h-12 flex-1 rounded-2xl text-sm font-semibold text-white"
          style={{ background: place.color }}
        >
          저장하기
        </Button>
        {onSchedule && (
          <Button
            onClick={() => onSchedule({ ...place, category, memo: memo.trim() || undefined })}
            variant="outline"
            className="h-12 flex-1 rounded-2xl border-slate-300 text-sm font-semibold text-slate-700"
          >
            일정에 추가
          </Button>
        )}
      </div>
    </div>
  );
}

interface PhotoLightboxProps {
  photoNames: string[];
  index: number;
  alt: string;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/** Full-screen photo viewer opened by tapping a gallery thumbnail — prev/next cycles through every photo the gallery has, not just the one that was tapped. */
function PhotoLightbox({ photoNames, index, alt, onClose, onNavigate }: PhotoLightboxProps) {
  const hasPrev = index > 0;
  const hasNext = index < photoNames.length - 1;

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X size={18} />
      </button>

      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index - 1);
          }}
          aria-label="이전 사진"
          className="absolute left-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4"
        >
          <ChevronLeft size={20} />
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element -- served via /api/places/photo redirect proxy */}
      <img
        src={`/api/places/photo?name=${encodeURIComponent(photoNames[index])}&w=1200`}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain"
      />

      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index + 1);
          }}
          aria-label="다음 사진"
          className="absolute right-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4"
        >
          <ChevronRight size={20} />
        </button>
      )}

      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white">
        {index + 1} / {photoNames.length}
      </span>
    </motion.div>
  );
}
