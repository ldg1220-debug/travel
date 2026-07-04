"use client";

import { useRouter } from "next/navigation";
import { Heart, MapPin, X } from "lucide-react";
import { useItineraryStore } from "@/store/itineraryStore";
import { PlaceGlyph } from "@/app/(app)/planner/icons";

// ─────────────────────────────────────────────────────────────
// The global App Bar (hamburger + title + Sheet nav) already lives in
// src/components/AppBar.tsx, rendered once by src/app/(app)/layout.tsx
// above every screen in this group — this page owns only the content
// below it, not another header.
//
// A fully independent tab from /scrapbook (다녀온 여행 보관함, past
// *trips*): this one lists `savedPlaces` — individual 관심 장소 saved
// from /planner's 관심 장소 tab or /discover's card taps — with no
// itinerary/date attached at all.
export default function SavedPlacesPage() {
  const router = useRouter();
  const savedPlaces = useItineraryStore((s) => s.savedPlaces);
  const removeSavedPlace = useItineraryStore((s) => s.removeSavedPlace);

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">관심 장소 보관함</h2>
          <p className="mt-1 text-[13px] text-slate-500">일정에 담기 전에 찜해둔 장소들이에요.</p>
        </div>

        {savedPlaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Heart size={24} />
            </span>
            <p className="text-sm font-semibold text-slate-700">아직 저장한 장소가 없어요</p>
            <p className="mt-1 text-[13px] text-slate-400">탐색이나 계획 화면에서 마음에 드는 장소를 찜해보세요.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {savedPlaces.map((place) => (
              <div
                key={place.id}
                onClick={() => router.push(`/planner?openDetail=${encodeURIComponent(place.id)}`)}
                className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm transition-shadow hover:shadow-md"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: place.color }}
                >
                  <PlaceGlyph icon={place.icon} size={18} color="white" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-slate-900">{place.name}</p>
                  <p className="truncate text-[12px] text-slate-500">{place.memo || place.address || place.category}</p>
                </div>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400">
                  <MapPin size={14} />
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSavedPlace(place.id);
                  }}
                  aria-label={`${place.name} 저장 해제`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
