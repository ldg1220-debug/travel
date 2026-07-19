"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  acceptFollowRequest,
  fetchUserProfile,
  followUser,
  rejectFollowRequest,
  unfollowUser,
  type UserProfile,
} from "@/lib/api";
import { LoginModal } from "@/components/LoginModal";

/**
 * 트메 초대 랜딩 — 카카오톡으로 받은 "OOO님과 트메 맺기" 링크가 여는 페이지.
 * 초대한 사람의 공개 프로필을 보여주고, 로그인만 하면 그 자리에서 바로 트메
 * 신청(또는 이미 온 신청 수락)까지 끝낼 수 있다.
 */
export default function TmeInvitePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const userId = Number(params.id);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    if (!userId) return; // 잘못된 id는 렌더 단계에서 바로 not-found 처리
    let cancelled = false;
    fetchUserProfile(userId).then((data) => {
      if (cancelled) return;
      if (!data) setNotFound(true);
      else setProfile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isSelf = session?.user?.id != null && Number(session.user.id) === userId;

  const runAction = async (action: () => Promise<void>) => {
    if (!session?.user) {
      setLoginOpen(true);
      return;
    }
    setBusy(true);
    try {
      await action();
      const next = await fetchUserProfile(userId);
      setProfile(next);
    } finally {
      setBusy(false);
    }
  };

  if (notFound || !userId) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-slate-50 px-6 text-center dark:bg-slate-950">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">초대 링크를 찾을 수 없어요</p>
        <p className="mt-1 text-[13px] text-slate-400">링크가 잘못됐거나 탈퇴한 사용자일 수 있어요.</p>
      </div>
    );
  }
  if (!profile) {
    return <div className="flex min-h-full items-center justify-center bg-slate-50 text-[13px] text-slate-400 dark:bg-slate-950">불러오는 중…</div>;
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-slate-50 px-6 py-16 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-3xl font-bold text-white">
          {profile.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar / uploaded blob URL
            <img src={profile.image} alt="" className="h-full w-full object-cover" />
          ) : (
            (profile.nickname ?? "?").trim().charAt(0).toUpperCase()
          )}
        </div>
        <p className="text-[17px] font-bold text-slate-900 dark:text-slate-100">{profile.nickname ?? "여행자"}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          님이 트레쥴에서
          <br />
          트래블메이트(트메)를 맺고 싶어해요
        </p>

        <div className="mb-6 mt-5 flex items-center justify-center gap-8">
          <span className="text-center">
            <span className="block text-[15px] font-bold text-slate-800 dark:text-slate-100">{profile.followerCount}</span>
            <span className="block text-[11.5px] text-slate-400">팔로워</span>
          </span>
          <span className="text-center">
            <span className="block text-[15px] font-bold text-slate-800 dark:text-slate-100">{profile.followingCount}</span>
            <span className="block text-[11.5px] text-slate-400">트메</span>
          </span>
        </div>

        {isSelf ? (
          <p className="text-[13px] text-slate-400">내 초대 링크예요 — 카카오톡으로 친구에게 공유해보세요.</p>
        ) : profile.isFriend ? (
          <p className="text-[13.5px] font-semibold text-indigo-500">이미 서로 트메예요 🎉</p>
        ) : profile.isFollowing ? (
          <button
            onClick={() => runAction(() => unfollowUser(userId))}
            disabled={busy}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white text-[14px] font-semibold text-slate-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            트메
          </button>
        ) : profile.isPendingIncoming ? (
          <div className="flex w-full gap-2">
            <button
              onClick={() => runAction(() => acceptFollowRequest(userId))}
              disabled={busy}
              className="h-12 flex-1 rounded-2xl bg-indigo-600 text-[14px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              수락하기
            </button>
            <button
              onClick={() => runAction(() => rejectFollowRequest(userId))}
              disabled={busy}
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-[14px] font-semibold text-slate-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              거절
            </button>
          </div>
        ) : profile.isPendingOutgoing ? (
          <button
            onClick={() => runAction(() => unfollowUser(userId))}
            disabled={busy}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white text-[14px] font-semibold text-slate-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            요청됨 (취소)
          </button>
        ) : (
          <button
            onClick={() => runAction(() => followUser(userId))}
            disabled={busy}
            className="h-12 w-full rounded-2xl bg-indigo-600 text-[14px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            트메 신청 보내기
          </button>
        )}

        <button onClick={() => router.push("/")} className="mt-4 text-[12.5px] font-semibold text-slate-400 hover:text-slate-600">
          트레쥴 둘러보기
        </button>
      </div>

      {loginOpen && <LoginModal reason="트메를 맺으려면 로그인해주세요." onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
