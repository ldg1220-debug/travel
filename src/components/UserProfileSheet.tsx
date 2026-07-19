"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { fetchUserProfile, followUser, unfollowUser, type UserProfile } from "@/lib/api";
import { LoginModal } from "@/components/LoginModal";

/**
 * 닉네임을 탭하면 뜨는 공개 프로필 팝업 — 아바타·닉네임·팔로워/트메 수를 보여주고,
 * 본인이 아니면 트메 신청 버튼을 제공한다. "팔로잉"과 "친구"(맞팔로우)는 이 앱에서
 * 통틀어 "트래블메이트(트메)"라고 부른다.
 */
export function UserProfileSheet({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchUserProfile(userId).then((data) => {
      if (!cancelled) setProfile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isSelf = session?.user?.id != null && Number(session.user.id) === userId;

  const handleToggleFollow = async () => {
    if (!session?.user) {
      setLoginOpen(true);
      return;
    }
    if (!profile) return;
    setBusy(true);
    try {
      if (profile.isFollowing) {
        await unfollowUser(userId);
      } else {
        await followUser(userId);
      }
      const next = await fetchUserProfile(userId);
      setProfile(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[96] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl dark:bg-slate-900">
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X size={16} />
        </button>

        {!profile ? (
          <p className="py-16 text-center text-[13px] text-slate-400">불러오는 중…</p>
        ) : (
          <div className="flex flex-col items-center pt-2">
            <div className="mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-2xl font-bold text-white">
              {profile.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar / uploaded blob URL
                <img src={profile.image} alt="" className="h-full w-full object-cover" />
              ) : (
                (profile.nickname ?? "?").trim().charAt(0).toUpperCase()
              )}
            </div>
            <p className="mb-4 text-[16px] font-bold text-slate-900 dark:text-slate-100">{profile.nickname ?? "여행자"}</p>

            <div className="mb-5 flex items-center gap-8">
              <span className="text-center">
                <span className="block text-[15px] font-bold text-slate-800 dark:text-slate-100">{profile.followerCount}</span>
                <span className="block text-[11.5px] text-slate-400">팔로워</span>
              </span>
              <span className="text-center">
                <span className="block text-[15px] font-bold text-slate-800 dark:text-slate-100">{profile.followingCount}</span>
                <span className="block text-[11.5px] text-slate-400">트메</span>
              </span>
            </div>

            {!isSelf && (
              <button
                onClick={handleToggleFollow}
                disabled={busy}
                className={`h-11 w-full rounded-2xl text-[13.5px] font-semibold transition-colors disabled:opacity-60 ${
                  profile.isFollowing
                    ? "border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {profile.isFollowing ? "트메" : "트메 신청"}
              </button>
            )}
          </div>
        )}
      </div>

      {loginOpen && <LoginModal reason="트메를 맺으려면 로그인해주세요." onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
