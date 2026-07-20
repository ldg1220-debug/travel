"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { acceptFollowRequest, fetchUserProfile, followUser, rejectFollowRequest, unfollowUser, type UserProfile } from "@/lib/api";
import { LoginModal } from "@/components/LoginModal";

/**
 * 닉네임을 탭하면 뜨는 공개 프로필 팝업 — 아바타·닉네임·팔로워/트메 수를 보여주고,
 * 본인이 아니면 관계 상태에 따라 트메 신청/요청됨(취소)/수락하기 버튼을 제공한다.
 * "팔로잉"과 "친구"(맞팔로우)는 이 앱에서 통틀어 "트래블메이트(트메)"라고 부른다.
 *
 * `onChange`: 여기서 관계가 바뀔 때마다 호출된다 — 이 팝업은 자기 프로필만
 * 들고 있어서, 이걸 연 부모(팔로워/팔로잉 목록·팔로우 버튼 등)가 들고 있는
 * 카운트·목록은 스스로 갱신하지 않는다. 부모가 이 콜백으로 자기 상태를
 * 다시 불러오게 한다.
 */
export function UserProfileSheet({ userId, onClose, onChange }: { userId: number; onClose: () => void; onChange?: () => void }) {
  const router = useRouter();
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

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      const next = await fetchUserProfile(userId);
      setProfile(next);
      onChange?.();
    } finally {
      setBusy(false);
    }
  };

  const requireLogin = () => {
    if (!session?.user) {
      setLoginOpen(true);
      return true;
    }
    return false;
  };

  const handleRequest = () => {
    if (requireLogin()) return;
    runAction(() => followUser(userId));
  };
  const handleCancelOrUnfollow = () => {
    if (requireLogin()) return;
    runAction(() => unfollowUser(userId));
  };
  const handleAccept = () => {
    if (requireLogin()) return;
    runAction(() => acceptFollowRequest(userId));
  };
  const handleReject = () => {
    if (requireLogin()) return;
    runAction(() => rejectFollowRequest(userId));
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

            {/* 트래블 메이트는 상호 관계라 카운트는 하나 — 팔로워/팔로잉 구분이 없다. */}
            <div className="mb-5 text-center">
              <span className="block text-[15px] font-bold text-slate-800 dark:text-slate-100">{profile.followingCount}</span>
              <span className="block text-[11.5px] text-slate-400">트래블 메이트</span>
            </div>

            {!isSelf && profile.isFriend && (
              <button
                onClick={() => router.push(`/messages/${userId}`)}
                className="mb-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-indigo-600 text-[13.5px] font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                <CordixIcon name="message" size={15} stroke="#fff" accent="#fff" /> 메시지 보내기
              </button>
            )}

            {!isSelf &&
              (profile.isFollowing ? (
                <button
                  onClick={handleCancelOrUnfollow}
                  disabled={busy}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white text-[13.5px] font-semibold text-slate-500 transition-colors disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  트래블 메이트 ✓
                </button>
              ) : profile.isPendingIncoming ? (
                <div className="flex w-full gap-2">
                  <button
                    onClick={handleAccept}
                    disabled={busy}
                    className="h-11 flex-1 rounded-2xl bg-indigo-600 text-[13.5px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                  >
                    수락하기
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={busy}
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-[13.5px] font-semibold text-slate-500 transition-colors disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    거절
                  </button>
                </div>
              ) : profile.isPendingOutgoing ? (
                <button
                  onClick={handleCancelOrUnfollow}
                  disabled={busy}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white text-[13.5px] font-semibold text-slate-500 transition-colors disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  요청됨
                </button>
              ) : (
                <button
                  onClick={handleRequest}
                  disabled={busy}
                  className="h-11 w-full rounded-2xl bg-indigo-600 text-[13.5px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                >
                  트래블 메이트 신청
                </button>
              ))}
          </div>
        )}
      </div>

      {loginOpen && <LoginModal reason="트래블 메이트를 맺으려면 로그인해주세요." onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
