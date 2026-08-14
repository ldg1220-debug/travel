"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { fetchFollowList, type FollowUser, type Visibility } from "@/lib/api";

const OPTIONS: { value: Visibility; label: string; icon: "globe" | "group" | "user" | "lock" }[] = [
  { value: "public", label: "전체공개", icon: "globe" },
  { value: "friends", label: "메이트공개", icon: "group" },
  { value: "custom", label: "특정인공개", icon: "user" },
  { value: "private", label: "비공개", icon: "lock" },
];

/**
 * 4-way trip post visibility picker — 전체공개/트메공개(맞팔로우)/특정인공개(내
 * 팔로워 중 선택)/비공개. Shared by TripPostComposer (작성 시점) and
 * /trip/[id]'s owner view (작성 후 바로 변경). 한 줄짜리 알약 4개로 눌러
 * 고르고, "특정인공개"만 별도로 누구를 볼 수 있게 할지 골라야 해서 그
 * 목록은 인라인으로 펼치는 대신 팝업으로 띄운다 — 나머지 세 선택지는
 * 고르는 순간 끝이라 같은 자리를 계속 차지할 이유가 없다.
 */
export function VisibilitySelector({
  value,
  onChange,
  visibleToUserIds,
  onVisibleToUserIdsChange,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
  visibleToUserIds: number[];
  onVisibleToUserIdsChange: (ids: number[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [followers, setFollowers] = useState<FollowUser[] | null>(null);
  const loadingFollowers = pickerOpen && followers == null;

  useEffect(() => {
    if (!pickerOpen || followers != null) return;
    let cancelled = false;
    fetchFollowList("followers").then((users) => {
      if (!cancelled) setFollowers(users);
    });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen, followers]);

  const toggleUser = (id: number) => {
    onVisibleToUserIdsChange(visibleToUserIds.includes(id) ? visibleToUserIds.filter((u) => u !== id) : [...visibleToUserIds, id]);
  };

  const handleSelect = (next: Visibility) => {
    onChange(next);
    if (next === "custom") setPickerOpen(true);
  };

  return (
    <div>
      <div className="flex gap-1.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleSelect(opt.value)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-full border px-1.5 py-1.5 text-[11px] font-semibold transition-colors ${
              value === opt.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
            }`}
          >
            <CordixIcon name={opt.icon} size={12} stroke={value === opt.value ? "#BC5200" : "#94a3b8"} accent={value === opt.value ? "#BC5200" : "#94a3b8"} />
            <span className="truncate">{opt.label}</span>
          </button>
        ))}
      </div>

      {value === "custom" && (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mt-1.5 text-[11px] font-semibold text-brand-600 hover:underline"
        >
          {visibleToUserIds.length > 0 ? `${visibleToUserIds.length}명 선택됨 · 목록 수정` : "공개할 메이트를 선택해주세요"}
        </button>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPickerOpen(false)} />
          <div className="relative flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
              <p className="text-[14px] font-bold text-slate-800">공개할 트래블 메이트 선택</p>
              <button onClick={() => setPickerOpen(false)} aria-label="닫기" className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {loadingFollowers ? (
                <p className="py-8 text-center text-[12.5px] text-slate-400">불러오는 중…</p>
              ) : !followers || followers.length === 0 ? (
                <p className="py-8 text-center text-[12.5px] text-slate-400">아직 나를 팔로우하는 사람이 없어요</p>
              ) : (
                <div className="space-y-1">
                  {followers.map((f) => (
                    <label key={f.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-[13px] hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={visibleToUserIds.includes(f.id)}
                        onChange={() => toggleUser(f.id)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                      />
                      {f.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- OAuth profile image URL
                        <img src={f.image} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-pink-500 text-[10px] font-bold text-white">
                          {(f.name ?? "여").trim().charAt(0)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-slate-700">{f.name ?? "여행자"}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 p-3">
              <button
                onClick={() => setPickerOpen(false)}
                className="h-11 w-full rounded-2xl bg-brand-700 text-[13px] font-semibold text-white transition-opacity hover:bg-brand-800"
              >
                완료{visibleToUserIds.length > 0 && ` (${visibleToUserIds.length}명)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
