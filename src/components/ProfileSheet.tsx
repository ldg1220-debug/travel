"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Loader2 } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import {
  fetchFollowList,
  fetchFollowStatus,
  followUser,
  unfollowUser,
  updateProfile,
  uploadReviewPhotos,
  type FollowUser,
} from "@/lib/api";
import { resizeImageFiles } from "@/lib/imageResize";
import { UserProfileSheet } from "@/components/UserProfileSheet";

type Tab = "settings" | "followers" | "following";

/**
 * 닉네임·프로필 사진 편집 + 팔로워/팔로잉 목록 — 사이드 서랍 맨 아래 계정 행을
 * 눌러 연다. 이름/이메일은 OAuth 제공자가 준 실명·개인정보라 여기서 바꿀 수
 * 없고, 다른 사용자에게는 절대 노출되지 않는다 — 공개 표시 이름은 오직 닉네임뿐.
 *
 * `mandatory`: 가입 직후 닉네임이 아직 없을 때 AppBar가 강제로 띄우는 첫 설정
 * 모드 — 닫기 버튼/배경 클릭 닫기를 모두 막고 탭 없이 설정 화면만 보여준다,
 * 닉네임을 정하기 전엔 앱을 쓸 수 없다.
 */
export function ProfileSheet({ onClose, mandatory = false }: { onClose: () => void; mandatory?: boolean }) {
  const { data: session, update } = useSession();
  const [nickname, setNickname] = useState(session?.user?.nickname ?? "");
  const [image, setImage] = useState<string | null | undefined>(session?.user?.image);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("settings");
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followers, setFollowers] = useState<FollowUser[] | null>(null);
  const [following, setFollowing] = useState<FollowUser[] | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [profileUserId, setProfileUserId] = useState<number | null>(null);

  // 이용약관·개인정보처리방침 필수 동의 — 아직 동의 기록이 없는 계정이
  // mandatory 게이트를 만나면 체크해야 저장(=앱 진입)할 수 있다.
  const needsConsent = mandatory && !session?.user?.termsAgreed;
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  const followingIds = new Set((following ?? []).map((u) => u.id));

  // 팔로워/팔로잉 카운트 + 목록을 새로 불러온다 — mandatory 모드(가입
  // 직후)엔 아직 팔로우 관계가 있을 리 없어 건너뛴다. 중첩된
  // UserProfileSheet(팔로워/팔로잉 목록에서 이름을 눌러 연 프로필 팝업)에서
  // 트메 상태가 바뀌면 이 화면의 카운트·목록은 스스로 갱신되지 않으므로,
  // 그 팝업의 onChange로 이 함수를 다시 호출해준다.
  const refreshFollowData = () => {
    if (mandatory || !session?.user?.id) return;
    const userId = Number(session.user.id);
    fetchFollowStatus(userId).then((status) => {
      setFollowerCount(status.followerCount);
      setFollowingCount(status.followingCount);
    });
    fetchFollowList("following").then(setFollowing);
    if (followers != null) fetchFollowList("followers").then(setFollowers);
  };

  useEffect(() => {
    refreshFollowData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시점 1회 로드용, refreshFollowData는 매 렌더 재생성되지만 의도적으로 deps에서 뺐다.
  }, [mandatory, session?.user?.id]);

  useEffect(() => {
    if (tab !== "followers" || followers != null) return;
    fetchFollowList("followers").then(setFollowers);
  }, [tab, followers]);

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const [resized] = await resizeImageFiles([file]);
      const [url] = await uploadReviewPhotos([resized]);
      setImage(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드에 실패했어요");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 20 || !/^[가-힣a-zA-Z0-9_]+$/.test(trimmed)) {
      setError("닉네임은 한글·영문·숫자·_ 2~20자로 입력해주세요");
      return;
    }
    if (needsConsent && (!agreeTerms || !agreePrivacy)) {
      setError("이용약관과 개인정보처리방침에 모두 동의해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ nickname: trimmed, image: image ?? null, ...(needsConsent ? { agreeTerms: true } : {}) });
      await update();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했어요");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFollow = async (target: FollowUser) => {
    setBusyIds((prev) => new Set(prev).add(target.id));
    try {
      if (followingIds.has(target.id)) {
        await unfollowUser(target.id);
        setFollowing((prev) => (prev ?? []).filter((u) => u.id !== target.id));
        setFollowingCount((c) => c - 1);
      } else {
        await followUser(target.id);
        setFollowing((prev) => [...(prev ?? []), target]);
        setFollowingCount((c) => c + 1);
      }
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={mandatory ? undefined : onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold dark:text-slate-100">
            {mandatory ? (session?.user?.nickname ? "서비스 이용 동의가 필요해요" : "닉네임을 설정해주세요") : "프로필"}
          </h3>
          {!mandatory && (
            <button
              onClick={onClose}
              aria-label="닫기"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X size={16} />
            </button>
          )}
        </div>
        {mandatory && (
          <p className="mb-5 -mt-3 text-[12.5px] text-slate-400">
            다른 사람에게는 실명 대신 닉네임이 표시돼요. 한 번 정하면 언제든 다시 바꿀 수 있어요.
          </p>
        )}

        {!mandatory && (
          <div className="mb-4 flex gap-1.5">
            {(
              [
                { value: "settings", label: "설정" },
                { value: "followers", label: `팔로워 ${followerCount}` },
                { value: "following", label: `트메 ${followingCount}` },
              ] as const
            ).map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${
                  tab === t.value ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "settings" ? (
            <>
              <div className="mb-6 flex flex-col items-center gap-2.5">
                <label className="relative cursor-pointer">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-3xl font-bold text-white">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL / OAuth avatar URL
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (nickname || "?").trim().charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white dark:border-slate-900">
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <CordixIcon name="camera" size={13} stroke="#fff" accent="#fff" />}
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files)} disabled={uploading} />
                </label>
                {image && (
                  <button onClick={() => setImage(null)} className="text-[12px] font-semibold text-slate-400 hover:text-rose-500">
                    사진 삭제
                  </button>
                )}
              </div>

              <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">닉네임</label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 20))}
                placeholder="닉네임"
                className="mb-1 w-full rounded-2xl border border-slate-200 px-3.5 py-3 text-[14px] outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <p className="mb-4 text-right text-[11px] text-slate-400">{nickname.length}/20</p>

              {session?.user?.email && (
                <div className="mb-5 flex items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-3 dark:bg-slate-800/60">
                  <span className="text-[12.5px] text-slate-500 dark:text-slate-400">이메일</span>
                  <span className="truncate text-[12.5px] font-medium text-slate-700 dark:text-slate-200">{session.user.email}</span>
                </div>
              )}

              {needsConsent && (
                <div className="mb-5 space-y-2.5 rounded-2xl border border-slate-200 p-3.5 dark:border-slate-700">
                  <label className="flex items-center gap-2.5 text-[12.5px] text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                    />
                    <span className="min-w-0 flex-1">
                      (필수){" "}
                      <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                        이용약관
                      </a>
                      에 동의합니다
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 text-[12.5px] text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={agreePrivacy}
                      onChange={(e) => setAgreePrivacy(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                    />
                    <span className="min-w-0 flex-1">
                      (필수){" "}
                      <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                        개인정보처리방침
                      </a>
                      에 동의합니다
                    </span>
                  </label>
                </div>
              )}

              {error && <p className="mb-3 text-center text-[12px] text-rose-500">{error}</p>}

              <button
                onClick={handleSave}
                disabled={saving || uploading}
                className="h-12 w-full rounded-2xl bg-indigo-600 text-sm font-semibold text-white transition-opacity hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </>
          ) : (
            <FollowUserList
              users={tab === "followers" ? followers : following}
              followingIds={followingIds}
              busyIds={busyIds}
              onToggleFollow={handleToggleFollow}
              onOpenProfile={setProfileUserId}
              emptyText={tab === "followers" ? "아직 나를 팔로우하는 사람이 없어요" : "아직 트메가 없어요"}
            />
          )}
        </div>
      </div>

      {profileUserId != null && (
        <UserProfileSheet userId={profileUserId} onClose={() => setProfileUserId(null)} onChange={refreshFollowData} />
      )}
    </div>
  );
}

function FollowUserList({
  users,
  followingIds,
  busyIds,
  onToggleFollow,
  onOpenProfile,
  emptyText,
}: {
  users: FollowUser[] | null;
  followingIds: Set<number>;
  busyIds: Set<number>;
  onToggleFollow: (user: FollowUser) => void;
  onOpenProfile: (userId: number) => void;
  emptyText: string;
}) {
  if (users == null) {
    return <p className="py-10 text-center text-[12.5px] text-slate-400">불러오는 중…</p>;
  }
  if (users.length === 0) {
    return <p className="py-10 text-center text-[12.5px] text-slate-400">{emptyText}</p>;
  }
  return (
    <div className="space-y-1">
      {users.map((u) => {
        const isFollowing = followingIds.has(u.id);
        return (
          <div key={u.id} className="flex items-center gap-2.5 rounded-xl px-1 py-2">
            <button onClick={() => onOpenProfile(u.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              {u.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar / uploaded blob URL
                <img src={u.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 text-xs font-bold text-white">
                  {(u.name ?? "여").trim().charAt(0)}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-slate-700 dark:text-slate-200">{u.name ?? "여행자"}</span>
            </button>
            <button
              onClick={() => onToggleFollow(u)}
              disabled={busyIds.has(u.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
                isFollowing
                  ? "border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {isFollowing ? "트메" : "트메 신청"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
