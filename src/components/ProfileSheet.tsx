"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Loader2 } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import {
  acceptFollowRequest,
  fetchFollowList,
  fetchFollowStatus,
  followUser,
  rejectFollowRequest,
  unfollowUser,
  updateProfile,
  uploadReviewPhotos,
  type FollowUser,
} from "@/lib/api";
import { resizeImageFiles } from "@/lib/imageResize";
import { shareToKakao } from "@/lib/kakaoShare";
import { UserProfileSheet } from "@/components/UserProfileSheet";

type Tab = "settings" | "mates" | "requests";

/**
 * 닉네임·프로필 사진 편집 + 트래블 메이트 목록/신청 관리 — 사이드 서랍 맨 아래 계정 행을
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
  // 트래블 메이트는 상호 관계 — 카운트도 목록도 하나뿐이다(팔로워/팔로잉 구분 없음).
  const [mateCount, setMateCount] = useState(0);
  const [mates, setMates] = useState<FollowUser[] | null>(null);
  // 대기 중인 트래블 메이트 신청 — received: 나에게 온 것(수락/거절), sent: 내가 보낸 것(취소).
  const [received, setReceived] = useState<FollowUser[] | null>(null);
  const [sent, setSent] = useState<FollowUser[] | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // 이용약관·개인정보처리방침 필수 동의 — 아직 동의 기록이 없는 계정이
  // mandatory 게이트를 만나면 체크해야 저장(=앱 진입)할 수 있다.
  const needsConsent = mandatory && !session?.user?.termsAgreed;
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  const mateIds = new Set((mates ?? []).map((u) => u.id));
  const sentIds = new Set((sent ?? []).map((u) => u.id));

  // 트래블 메이트 카운트 + 목록을 새로 불러온다 — mandatory 모드(가입
  // 직후)엔 아직 관계가 있을 리 없어 건너뛴다. 중첩된 UserProfileSheet
  // (목록에서 이름을 눌러 연 프로필 팝업)에서 관계가 바뀌면 이 화면의
  // 카운트·목록은 스스로 갱신되지 않으므로, 그 팝업의 onChange로 이 함수를
  // 다시 호출해준다.
  const refreshFollowData = () => {
    if (mandatory || !session?.user?.id) return;
    const userId = Number(session.user.id);
    fetchFollowStatus(userId).then((status) => setMateCount(status.followingCount));
    fetchFollowList("following").then(setMates);
    fetchFollowList("sent").then(setSent);
    fetchFollowList("received").then(setReceived);
  };

  useEffect(() => {
    refreshFollowData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시점 1회 로드용, refreshFollowData는 매 렌더 재생성되지만 의도적으로 deps에서 뺐다.
  }, [mandatory, session?.user?.id]);

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

  const withBusy = async (id: number, action: () => Promise<void>) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await action();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleToggleFollow = (target: FollowUser) =>
    withBusy(target.id, async () => {
      if (mateIds.has(target.id)) {
        // 메이트 해제 — 상호 관계라 서버에서 양방향이 함께 끊긴다
        await unfollowUser(target.id);
        setMates((prev) => (prev ?? []).filter((u) => u.id !== target.id));
        setMateCount((c) => c - 1);
      } else if (sentIds.has(target.id)) {
        // 내가 보낸 신청 취소
        await unfollowUser(target.id);
        setSent((prev) => (prev ?? []).filter((u) => u.id !== target.id));
      } else {
        // 트래블 메이트 신청 — 상대가 수락해야 목록/카운트에 반영되므로 '보낸 신청'에만 추가
        await followUser(target.id);
        setSent((prev) => [...(prev ?? []), target]);
      }
    });

  const handleAcceptRequest = (target: FollowUser) =>
    withBusy(target.id, async () => {
      await acceptFollowRequest(target.id);
      setReceived((prev) => (prev ?? []).filter((u) => u.id !== target.id));
      // 수락 = 상호 관계 성립 — 바로 내 트래블 메이트 목록/카운트에 반영
      setMates((prev) => (prev == null ? prev : [target, ...prev]));
      setMateCount((c) => c + 1);
    });

  const handleRejectRequest = (target: FollowUser) =>
    withBusy(target.id, async () => {
      await rejectFollowRequest(target.id);
      setReceived((prev) => (prev ?? []).filter((u) => u.id !== target.id));
    });

  // 카카오톡으로 내 트래블 메이트 초대 링크 공유 — 받은 친구는 /tme/[내 id]
  // 랜딩에서 로그인만 하면 바로 신청을 보낼 수 있다. (카카오 친구 목록 API는 비즈
  // 앱 심사가 필요해, 공유 메시지 기반 초대로 제공)
  const handleKakaoInvite = async () => {
    if (!session?.user?.id) return;
    setInviteError(null);
    try {
      await shareToKakao({
        title: `${session.user.nickname ?? "여행자"}님의 트래블 메이트 초대`,
        description: "트레쥴에서 트래블 메이트(여행 친구)를 맺고 여행 후기·계획을 함께 봐요!",
        url: `${window.location.origin}/tme/${session.user.id}`,
        buttonTitle: "트래블 메이트 맺으러 가기",
      });
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "카카오톡 공유에 실패했어요");
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
          <div className="mb-4 flex flex-wrap gap-1.5">
            {(
              [
                { value: "settings", label: "설정" },
                { value: "mates", label: `트래블 메이트 ${mateCount}` },
                { value: "requests", label: `신청${received && received.length > 0 ? ` ${received.length}` : ""}` },
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
          ) : tab === "requests" ? (
            <div className="space-y-6">
              <div>
                <p className="mb-1.5 text-[12.5px] font-bold text-slate-600 dark:text-slate-300">받은 신청</p>
                {received == null ? (
                  <p className="py-4 text-center text-[12.5px] text-slate-400">불러오는 중…</p>
                ) : received.length === 0 ? (
                  <p className="py-4 text-center text-[12.5px] text-slate-400">받은 트래블 메이트 신청이 없어요</p>
                ) : (
                  <div className="space-y-1">
                    {received.map((u) => (
                      <div key={u.id} className="flex items-center gap-2.5 rounded-xl px-1 py-2">
                        <button onClick={() => setProfileUserId(u.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                          {u.image ? (
                            // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar / uploaded blob URL
                            <img src={u.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 text-xs font-bold text-white">
                              {(u.name ?? "여").trim().charAt(0)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-slate-700 dark:text-slate-200">
                            {u.name ?? "여행자"}
                          </span>
                        </button>
                        <button
                          onClick={() => handleAcceptRequest(u)}
                          disabled={busyIds.has(u.id)}
                          className="shrink-0 rounded-full bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                          수락
                        </button>
                        <button
                          onClick={() => handleRejectRequest(u)}
                          disabled={busyIds.has(u.id)}
                          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          거절
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-[12.5px] font-bold text-slate-600 dark:text-slate-300">보낸 신청</p>
                {sent == null ? (
                  <p className="py-4 text-center text-[12.5px] text-slate-400">불러오는 중…</p>
                ) : sent.length === 0 ? (
                  <p className="py-4 text-center text-[12.5px] text-slate-400">보낸 트래블 메이트 신청이 없어요</p>
                ) : (
                  <div className="space-y-1">
                    {sent.map((u) => (
                      <div key={u.id} className="flex items-center gap-2.5 rounded-xl px-1 py-2">
                        <button onClick={() => setProfileUserId(u.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                          {u.image ? (
                            // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar / uploaded blob URL
                            <img src={u.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 text-xs font-bold text-white">
                              {(u.name ?? "여").trim().charAt(0)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-slate-700 dark:text-slate-200">
                            {u.name ?? "여행자"}
                          </span>
                        </button>
                        <button
                          onClick={() => handleToggleFollow(u)}
                          disabled={busyIds.has(u.id)}
                          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          요청됨 (취소)
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <FollowUserList
              users={mates}
              mateIds={mateIds}
              sentIds={sentIds}
              busyIds={busyIds}
              onToggleFollow={handleToggleFollow}
              onOpenProfile={setProfileUserId}
              emptyText="아직 트래블 메이트가 없어요"
            />
          )}

          {/* 카카오톡 초대 — 설정 탭을 제외한 모든 목록 탭 하단에 노출 */}
          {tab !== "settings" && (
            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                onClick={handleKakaoInvite}
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-[#FEE500] text-[13px] font-semibold text-black/85 transition-opacity hover:opacity-90"
              >
                <CordixIcon name="share" size={14} /> 카카오톡으로 트래블 메이트 초대하기
              </button>
              {inviteError && <p className="mt-2 text-center text-[11.5px] text-rose-500">{inviteError}</p>}
            </div>
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
  mateIds,
  sentIds,
  busyIds,
  onToggleFollow,
  onOpenProfile,
  emptyText,
}: {
  users: FollowUser[] | null;
  mateIds: Set<number>;
  /** 내가 보낸 트래블 메이트 신청이 대기 중인 상대 — 버튼을 "요청됨"으로 보여준다. */
  sentIds: Set<number>;
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
        const isMate = mateIds.has(u.id);
        const isPending = !isMate && sentIds.has(u.id);
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
                isMate || isPending
                  ? "border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {isMate ? "메이트 해제" : isPending ? "요청됨" : "메이트 신청"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
