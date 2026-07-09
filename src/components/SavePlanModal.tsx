"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { Input } from "@/components/ui/input";
import type { SavedPlan } from "@/lib/types";

interface SavePlanModalProps {
  atCap: boolean;
  savedPlans: SavedPlan[];
  onClose: () => void;
  onSave: (name: string, overwriteId?: string) => void;
}

/** Small naming prompt for "현재 계획을 새 이름으로 저장" — opened from the AppBar's 계획 메뉴. */
export function SavePlanModal({ atCap, savedPlans, onClose, onSave }: SavePlanModalProps) {
  const [name, setName] = useState("");
  // Set once the typed name collides with an existing saved plan — asks
  // whether to overwrite it in place or keep both under the same name,
  // instead of silently stacking a second plan with an identical label.
  const [duplicate, setDuplicate] = useState<SavedPlan | null>(null);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = savedPlans.find((p) => p.name === trimmed);
    if (existing) {
      setDuplicate(existing);
      return;
    }
    onSave(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[340px] rounded-3xl bg-white p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100"
          aria-label="닫기"
        >
          <Icon name="x" size={14} color="#64748b" />
        </button>

        <div className="text-[17px] font-semibold text-slate-900">현재 계획 저장</div>

        {atCap ? (
          <p className="mt-1 text-[13px] text-slate-500">
            최대 10개까지 저장할 수 있어요. 기존 계획을 삭제한 뒤 다시 저장해주세요.
          </p>
        ) : duplicate ? (
          <>
            <p className="mt-1 text-[13px] text-slate-500">
              &ldquo;{duplicate.name}&rdquo; 계획이 이미 있어요. 덮어쓸까요, 다른 이름으로 저장할까요?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => onSave(name.trim(), duplicate.id)}
                className="h-11 w-full rounded-2xl bg-slate-900 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
              >
                덮어쓰기
              </button>
              <button
                onClick={() => setDuplicate(null)}
                className="h-11 w-full rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                다른 이름으로 저장
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-[13px] text-slate-500">지금 짜고 있는 일정을 이름을 붙여 스냅샷으로 저장해요.</p>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="예: 오사카 여행 A안"
              maxLength={30}
              className="mt-4 h-11 rounded-xl text-sm"
            />
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="mt-4 h-11 w-full rounded-2xl bg-slate-900 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              저장하기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
