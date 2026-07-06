"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { Input } from "@/components/ui/input";

interface SavePlanModalProps {
  atCap: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}

/** Small naming prompt for "현재 계획을 새 이름으로 저장" — opened from the AppBar's 계획 menu. */
export function SavePlanModal({ atCap, onClose, onSave }: SavePlanModalProps) {
  const [name, setName] = useState("");

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
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
