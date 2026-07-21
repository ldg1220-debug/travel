"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useItineraryStore } from "@/store/itineraryStore";

/**
 * Pick (or create) which 관심 장소 보관함 folder a place belongs to — a chip
 * row mirroring the category chips already used alongside it (PlaceDetailOverlay),
 * so filing a place doesn't require a separate trip to /saved-places afterward.
 */
export function FolderChips({ value, onChange }: { value: string | undefined; onChange: (folderId: string | undefined) => void }) {
  const folders = useItineraryStore((s) => s.savedPlaceFolders);
  const addFolder = useItineraryStore((s) => s.addSavedPlaceFolder);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const handleCreate = () => {
    const trimmed = name.trim();
    setCreating(false);
    setName("");
    if (!trimmed) return;
    onChange(addFolder(trimmed));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
          !value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"
        }`}
      >
        미분류
      </button>
      {folders.map((f) => (
        <button
          type="button"
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
            value === f.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"
          }`}
        >
          {f.name}
        </button>
      ))}
      {creating ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
            if (e.key === "Escape") {
              setCreating(false);
              setName("");
            }
          }}
          onBlur={handleCreate}
          placeholder="폴더 이름"
          maxLength={20}
          className="w-24 rounded-full border border-slate-300 px-2.5 py-1 text-[12px] outline-none focus:border-indigo-400"
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-[12px] font-medium text-slate-400 hover:border-indigo-300 hover:text-indigo-500"
        >
          <Plus size={11} /> 새 폴더
        </button>
      )}
    </div>
  );
}
