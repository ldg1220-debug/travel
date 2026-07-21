"use client";

import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { Icon } from "./Icon";
import { Input } from "@/components/ui/input";
import type { SavedPlan } from "@/lib/types";

export type SchedulePlanTarget = { type: "current" } | { type: "existing"; planId: string } | { type: "new"; name: string };

interface SchedulePlanPickerModalProps {
  placeName: string;
  savedPlans: SavedPlan[];
  activePlanId: string | null;
  /** Whether the working itinerary has edits that aren't reflected in `activePlanId`'s saved snapshot (or, with no active plan, whether it has any stops at all) — switching plans without saving loses these. */
  hasUnsavedChanges: boolean;
  atCap: boolean;
  onClose: () => void;
  onConfirm: (target: SchedulePlanTarget) => void;
}

/**
 * "이 장소를 어떤 계획에 추가할까요?" — opened from PlaceDetailOverlay's
 * "일정에 추가" button whenever more than one plan exists, instead of
 * silently dropping the place into whatever the working itinerary happens
 * to currently hold. Picking a plan other than the one currently loaded
 * switches the working itinerary to it (`loadPlan`), which discards any
 * unsaved edits still sitting in the old one — `hasUnsavedChanges` gates a
 * confirmation step for exactly that case.
 */
export function SchedulePlanPickerModal({
  placeName,
  savedPlans,
  activePlanId,
  hasUnsavedChanges,
  atCap,
  onClose,
  onConfirm,
}: SchedulePlanPickerModalProps) {
  const [pending, setPending] = useState<SchedulePlanTarget | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const pick = (target: SchedulePlanTarget, switchesPlan: boolean) => {
    if (switchesPlan && hasUnsavedChanges) {
      setPending(target);
      return;
    }
    onConfirm(target);
  };

  const handleCreateSubmit = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    pick({ type: "new", name: trimmed }, true);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[360px] rounded-3xl bg-white p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100"
          aria-label="닫기"
        >
          <Icon name="x" size={14} color="#64748b" />
        </button>

        {pending ? (
          <>
            <div className="text-[17px] font-semibold text-slate-900">저장 안 된 변경사항이 있어요</div>
            <p className="mt-1 text-[13px] text-slate-500">
              지금 작업 중인 일정을 저장하지 않고 다른 계획으로 옮기면 그 내용이 사라져요. 계속할까요?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => onConfirm(pending)}
                className="h-11 w-full rounded-2xl bg-rose-600 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
              >
                계속할래요
              </button>
              <button
                onClick={() => setPending(null)}
                className="h-11 w-full rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                취소
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-[17px] font-semibold text-slate-900">어떤 계획에 추가할까요?</div>
            <p className="mt-1 text-[13px] text-slate-500">
              &ldquo;{placeName}&rdquo;을(를) 추가할 계획을 골라주세요.
            </p>

            <div className="mt-4 flex max-h-60 flex-col gap-1.5 overflow-y-auto">
              {activePlanId == null && (
                <button
                  onClick={() => pick({ type: "current" }, false)}
                  className="flex items-center justify-between rounded-2xl border border-slate-900 bg-slate-900/5 px-4 py-3 text-left text-sm font-semibold text-slate-900"
                >
                  지금 작업 중인 일정 (저장 안 됨)
                  <Check size={16} />
                </button>
              )}
              {savedPlans.map((plan) => {
                const isActive = plan.id === activePlanId;
                return (
                  <button
                    key={plan.id}
                    onClick={() => pick(isActive ? { type: "current" } : { type: "existing", planId: plan.id }, !isActive)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                      isActive ? "border-slate-900 bg-slate-900/5 text-slate-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">
                      {plan.name}
                      {isActive && <span className="ml-1.5 text-[11px] font-medium text-slate-400">(현재)</span>}
                    </span>
                    {isActive && <Check size={16} className="shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 border-t border-slate-100 pt-3">
              {creating ? (
                <div className="flex flex-col gap-2">
                  <Input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateSubmit()}
                    placeholder="예: 오사카 여행 B안"
                    maxLength={30}
                    className="h-11 rounded-xl text-sm"
                  />
                  {atCap ? (
                    <p className="text-[12.5px] text-rose-500">최대 10개까지 저장할 수 있어요. 기존 계획을 삭제한 뒤 다시 시도해주세요.</p>
                  ) : (
                    <button
                      onClick={handleCreateSubmit}
                      disabled={!newName.trim()}
                      className="h-11 w-full rounded-2xl bg-slate-900 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      새 계획 만들고 추가
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 py-3 text-[13.5px] font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-500"
                >
                  <Plus size={14} /> 새 계획 만들기
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
