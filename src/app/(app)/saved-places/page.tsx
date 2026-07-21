"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, FolderPlus, Check } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { useItineraryStore } from "@/store/itineraryStore";
import { PlaceGlyph } from "@/app/(app)/planner/icons";
import { CATEGORY_OPTIONS } from "@/app/(app)/planner/PlaceDetailOverlay";
import { shareToKakao } from "@/lib/kakaoShare";
import type { Place } from "@/lib/types";

// Saved places whose `category` isn't one of the 6 canonical values (e.g. a
// raw Google `primaryType` or Kakao category string that was never manually
// re-classified) fall into this catch-all filter bucket instead of vanishing
// from every specific tab.
const OTHER_CATEGORY = "__other__";
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]));
const isKnownCategory = (category: string) => category in CATEGORY_LABEL;

// A second, user-owned organizing axis on top of `category` (which is a
// fixed 6-value auto-classification) — folders are freely named/created/
// deleted by the user (e.g. "오사카 후보", "다음에 가볼 곳"). A place can be
// in at most one folder; unfiled places fall into this catch-all filter.
const UNFILED_FOLDER = "__unfiled__";

// ─────────────────────────────────────────────────────────────
// The global App Bar (hamburger + title + Sheet nav) already lives in
// src/components/AppBar.tsx, rendered once by src/app/(app)/layout.tsx
// above every screen in this group — this page owns only the content
// below it, not another header.
//
// A fully independent tab from /scrapbook (다녀온 여행 보관함, past
// *trips*): this one lists `savedPlaces` — individual 관심 장소 saved
// from /planner's 관심 장소 탭 or /discover's card taps — with no
// itinerary/date attached at all.
export default function SavedPlacesPage() {
  const router = useRouter();
  const savedPlaces = useItineraryStore((s) => s.savedPlaces);
  const removeSavedPlace = useItineraryStore((s) => s.removeSavedPlace);
  const upsertSavedPlace = useItineraryStore((s) => s.upsertSavedPlace);
  const savedPlaceFolders = useItineraryStore((s) => s.savedPlaceFolders);
  const addSavedPlaceFolder = useItineraryStore((s) => s.addSavedPlaceFolder);
  const renameSavedPlaceFolder = useItineraryStore((s) => s.renameSavedPlaceFolder);
  const deleteSavedPlaceFolder = useItineraryStore((s) => s.deleteSavedPlaceFolder);
  const setSavedPlaceFolder = useItineraryStore((s) => s.setSavedPlaceFolder);

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [toast, setToast] = useState<string | null>(null);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    addSavedPlaceFolder(name);
    setNewFolderName("");
    setCreatingFolder(false);
  };

  const handleRenameFolder = (id: string) => {
    const name = editingFolderName.trim();
    if (name) renameSavedPlaceFolder(id, name);
    setEditingFolderId(null);
  };

  const handleDeleteFolder = (id: string) => {
    deleteSavedPlaceFolder(id);
    setConfirmDeleteFolderId(null);
    if (folderFilter === id) setFolderFilter("all");
  };

  // 관심 장소 카카오톡 공유 — 이 앱엔 개별 장소용 공유 링크(shareToken)가
  // 없으므로, 구글 지도 좌표 링크로 공유한다 (계획 공유는 실제 서버에 저장된
  // itinerary의 shareToken을 쓰는 PlannerBoard의 handleShareToKakao와 다름).
  const handleSharePlace = async (place: Place) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
    try {
      await shareToKakao({
        title: place.name,
        description: place.memo || place.address || CATEGORY_LABEL[place.category] || "관심 장소",
        url,
        buttonTitle: "지도에서 보기",
      });
    } catch {
      setToast("카카오톡 공유에 실패했어요");
      setTimeout(() => setToast(null), 1600);
    }
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of savedPlaces) {
      const key = isKnownCategory(p.category) ? p.category : OTHER_CATEGORY;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [savedPlaces]);

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of savedPlaces) {
      const key = p.folderId ?? UNFILED_FOLDER;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [savedPlaces]);

  const visiblePlaces = useMemo(() => {
    let list = savedPlaces;
    if (categoryFilter === OTHER_CATEGORY) list = list.filter((p) => !isKnownCategory(p.category));
    else if (categoryFilter !== "all") list = list.filter((p) => p.category === categoryFilter);
    if (folderFilter === UNFILED_FOLDER) list = list.filter((p) => !p.folderId);
    else if (folderFilter !== "all") list = list.filter((p) => p.folderId === folderFilter);
    return list;
  }, [savedPlaces, categoryFilter, folderFilter]);

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
              <CordixIcon name="heart" size={24} />
            </span>
            <p className="text-sm font-semibold text-slate-700">아직 저장한 장소가 없어요</p>
            <p className="mt-1 text-[13px] text-slate-400">탐색이나 계획 화면에서 마음에 드는 장소를 찜해보세요.</p>
          </div>
        ) : (
          <>
            {/* 내 폴더 — 카테고리(자동 분류)와 별개로 내가 직접 이름 붙이고
                만드는 분류. 선택된 폴더 칩 아래에만 이름 변경/삭제가 나타나
                평소엔 목록이 복잡해 보이지 않는다. */}
            <div className="mb-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setFolderFilter("all")}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    folderFilter === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  전체 폴더
                </button>
                {savedPlaceFolders.map((folder) => {
                  const active = folderFilter === folder.id;
                  return (
                    <button
                      key={folder.id}
                      onClick={() => setFolderFilter(active ? "all" : folder.id)}
                      className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                        active ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {folder.name} <span className="opacity-70">{folderCounts.get(folder.id) ?? 0}</span>
                    </button>
                  );
                })}
                {(folderCounts.get(UNFILED_FOLDER) ?? 0) > 0 && (
                  <button
                    onClick={() => setFolderFilter(folderFilter === UNFILED_FOLDER ? "all" : UNFILED_FOLDER)}
                    className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      folderFilter === UNFILED_FOLDER ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    미분류 <span className="opacity-70">{folderCounts.get(UNFILED_FOLDER)}</span>
                  </button>
                )}
                {creatingFolder ? (
                  <span className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateFolder();
                        if (e.key === "Escape") setCreatingFolder(false);
                      }}
                      placeholder="폴더 이름"
                      maxLength={20}
                      className="w-28 rounded-full border border-indigo-300 px-3 py-1.5 text-[12px] outline-none"
                    />
                    <button onClick={handleCreateFolder} aria-label="폴더 추가" className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white hover:bg-indigo-600">
                      <Check size={13} />
                    </button>
                    <button onClick={() => setCreatingFolder(false)} aria-label="취소" className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
                      <X size={13} />
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setCreatingFolder(true)}
                    className="flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-500"
                  >
                    <FolderPlus size={13} /> 새 폴더
                  </button>
                )}
              </div>

              {/* 선택된 폴더가 있을 때만 이름 변경/삭제 도구를 보여준다. */}
              {folderFilter !== "all" && folderFilter !== UNFILED_FOLDER && (
                <div className="flex items-center gap-2 rounded-xl bg-indigo-50/60 px-3 py-1.5 text-[12px]">
                  {editingFolderId === folderFilter ? (
                    <>
                      <input
                        autoFocus
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameFolder(folderFilter);
                          if (e.key === "Escape") setEditingFolderId(null);
                        }}
                        maxLength={20}
                        className="min-w-0 flex-1 rounded-lg border border-indigo-300 px-2 py-1 text-[12px] outline-none"
                      />
                      <button onClick={() => handleRenameFolder(folderFilter)} className="font-semibold text-indigo-600">
                        저장
                      </button>
                      <button onClick={() => setEditingFolderId(null)} className="text-slate-400">
                        취소
                      </button>
                    </>
                  ) : confirmDeleteFolderId === folderFilter ? (
                    <>
                      <span className="flex-1 text-slate-500">이 폴더를 삭제할까요? 장소는 미분류로 남아요.</span>
                      <button onClick={() => handleDeleteFolder(folderFilter)} className="font-semibold text-rose-500">
                        삭제
                      </button>
                      <button onClick={() => setConfirmDeleteFolderId(null)} className="text-slate-400">
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-slate-500">
                        &ldquo;{savedPlaceFolders.find((f) => f.id === folderFilter)?.name}&rdquo; 폴더
                      </span>
                      <button
                        onClick={() => {
                          setEditingFolderId(folderFilter);
                          setEditingFolderName(savedPlaceFolders.find((f) => f.id === folderFilter)?.name ?? "");
                        }}
                        className="flex items-center gap-0.5 font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        <CordixIcon name="pencil" size={11} /> 이름 변경
                      </button>
                      <button
                        onClick={() => setConfirmDeleteFolderId(folderFilter)}
                        className="flex items-center gap-0.5 font-semibold text-rose-500 hover:text-rose-600"
                      >
                        <CordixIcon name="trash" size={11} /> 삭제
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 분류 필터 — 저장할 때 붙은 카테고리로 걸러본다. 6개 표준
                분류에 안 걸리는(구글/카카오 원본 카테고리 그대로인) 곳은
                기타로 묶는다. */}
            <div className="mb-4 flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategoryFilter("all")}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  categoryFilter === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                전체 <span className="opacity-70">{savedPlaces.length}</span>
              </button>
              {CATEGORY_OPTIONS.map((c) => {
                const count = counts.get(c.value) ?? 0;
                if (count === 0) return null;
                const active = categoryFilter === c.value;
                return (
                  <button
                    key={c.value}
                    onClick={() => setCategoryFilter(c.value)}
                    className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {c.label} <span className="opacity-70">{count}</span>
                  </button>
                );
              })}
              {(counts.get(OTHER_CATEGORY) ?? 0) > 0 && (
                <button
                  onClick={() => setCategoryFilter(OTHER_CATEGORY)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    categoryFilter === OTHER_CATEGORY
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  기타 <span className="opacity-70">{counts.get(OTHER_CATEGORY)}</span>
                </button>
              )}
            </div>

            {visiblePlaces.length === 0 ? (
              <p className="py-16 text-center text-[13px] text-slate-400">이 조건에는 저장된 장소가 없어요.</p>
            ) : (
              <div className="space-y-2.5">
                {visiblePlaces.map((place) => (
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
                    {/* 분류 편집 — 목록에서 바로 카테고리를 바꿀 수 있게, 전체
                        상세 오버레이를 열지 않아도 되도록 한다. */}
                    <select
                      value={isKnownCategory(place.category) ? place.category : ""}
                      onChange={(e) => {
                        e.stopPropagation();
                        upsertSavedPlace({ ...place, category: e.target.value });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${place.name} 분류 변경`}
                      className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 outline-none"
                    >
                      <option value="" disabled>
                        분류 선택
                      </option>
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    {/* 폴더 편집 — 내가 만든 폴더로 장소를 바로 옮길 수 있게. */}
                    {savedPlaceFolders.length > 0 && (
                      <select
                        value={place.folderId ?? ""}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSavedPlaceFolder(place.id, e.target.value || undefined);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${place.name} 폴더 변경`}
                        className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 outline-none"
                      >
                        <option value="">미분류</option>
                        {savedPlaceFolders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSharePlace(place);
                      }}
                      aria-label={`${place.name} 카카오톡 공유`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <CordixIcon name="share" size={14} />
                    </button>
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
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900/90 px-3.5 py-2 text-xs text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
