"use client";

import { useEffect, useState } from "react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { fetchFollowList, type FollowUser, type Visibility } from "@/lib/api";

const OPTIONS: { value: Visibility; label: string; icon: "globe" | "group" | "user" | "lock"; hint: string }[] = [
  { value: "public", label: "전체공개", icon: "globe", hint: "누구나 볼 수 있어요" },
  { value: "friends", label: "친구공개", icon: "group", hint: "맞팔로우한 친구만" },
  { value: "custom", label: "특정인공개", icon: "user", hint: "선택한 팔로워만" },
  { value: "private", label: "비공개", icon: "lock", hint: "나만 볼 수 있어요" },
];

/** 4-way trip post visibility picker — 전체공개/친구공개(맞팔로우)/특정인공개(내 팔로워 중 선택)/비공개. Shared by TripPostComposer (작성 시점) and /trip/[id]'s owner view (작성 후 바로 변경). */
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
  const [followers, setFollowers] = useState<FollowUser[] | null>(null);
  const loadingFollowers = value === "custom" && followers == null;

  useEffect(() => {
    if (value !== "custom" || followers != null) return;
    let cancelled = false;
    fetchFollowList("followers").then((users) => {
      if (!cancelled) setFollowers(users);
    });
    return () => {
      cancelled = true;
    };
  }, [value, followers]);

  const toggleUser = (id: number) => {
    onVisibleToUserIdsChange(visibleToUserIds.includes(id) ? visibleToUserIds.filter((u) => u !== id) : [...visibleToUserIds, id]);
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
              value === opt.value ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <CordixIcon name={opt.icon} size={16} stroke={value === opt.value ? "#6366f1" : "#94a3b8"} accent={value === opt.value ? "#6366f1" : "#94a3b8"} />
            <span className="min-w-0 flex-1">
              <span className={`block text-[12.5px] font-semibold ${value === opt.value ? "text-indigo-600" : "text-slate-700"}`}>{opt.label}</span>
              <span className="block truncate text-[10.5px] text-slate-400">{opt.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {value === "custom" && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          {loadingFollowers ? (
            <p className="py-3 text-center text-[12px] text-slate-400">불러오는 중…</p>
          ) : !followers || followers.length === 0 ? (
            <p className="py-3 text-center text-[12px] text-slate-400">아직 나를 팔로우하는 사람이 없어요</p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {followers.map((f) => (
                <label
                  key={f.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-white"
                >
                  <input
                    type="checkbox"
                    checked={visibleToUserIds.includes(f.id)}
                    onChange={() => toggleUser(f.id)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                  />
                  {f.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- OAuth profile image URL
                    <img src={f.image} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 text-[9px] font-bold text-white">
                      {(f.name ?? "여").trim().charAt(0)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-slate-700">{f.name ?? "여행자"}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
