"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import {
  deleteCommunityPost,
  fetchCommunityPost,
  updateCommunityPost,
  type CommunityPostDetail,
} from "@/lib/api";
import { formatDateLabel } from "@/lib/timeline";
import { communityCategoryLabel } from "@/lib/community";
import { CommunityVisibilitySelector } from "@/components/CommunityVisibilitySelector";
import { CommunityPostComments } from "@/components/CommunityPostComments";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { LoginModal } from "@/components/LoginModal";
import { UserProfileSheet } from "@/components/UserProfileSheet";

// 글쓴이만 쓰는 수정 모달이라, 읽기만 하는 방문자의 초기 번들에 실리지
// 않도록 클릭 시점에 따로 불러온다(trip/[id] 페이지와 같은 이유).
const CommunityPostComposer = dynamic(() => import("@/components/CommunityPostComposer").then((m) => m.CommunityPostComposer), { ssr: false });

/** 커뮤니티 글 하나 — 카테고리별 게시판의 상세 화면. 여행 후기(/trip/[id])와 별개 구조. */
export default function CommunityPostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<CommunityPostDetail | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);

  const reload = () => {
    const id = Number(params.id);
    fetchCommunityPost(id).then((data) => {
      if (!data) return;
      setPost(data.post);
      setIsOwner(data.isOwner);
    });
  };

  useEffect(() => {
    const id = Number(params.id);
    fetchCommunityPost(id).then((data) => {
      if (!data) {
        setNotFound(true);
        return;
      }
      setPost(data.post);
      setIsOwner(data.isOwner);
    });
  }, [params.id]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  const handleChangeVisibility = async (visibility: CommunityPostDetail["visibility"], visibleToUserIds: number[]) => {
    if (!post) return;
    setTogglingVisibility(true);
    try {
      await updateCommunityPost(post.id, { visibility, visibleToUserIds });
      setPost((prev) => (prev ? { ...prev, visibility, visibleToUserIds } : prev));
      showToast("공개 범위가 변경됐어요");
    } catch {
      showToast("변경에 실패했어요");
    } finally {
      setTogglingVisibility(false);
    }
  };

  const handleDelete = async () => {
    if (!post) return;
    setDeleting(true);
    try {
      await deleteCommunityPost(post.id);
      router.push("/community");
    } catch {
      showToast("삭제에 실패했어요");
      setDeleting(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <p className="text-sm font-semibold text-slate-700">글을 찾을 수 없어요</p>
        <p className="mt-1 text-[13px] text-slate-400">비공개 글이거나 삭제되었을 수 있어요.</p>
      </div>
    );
  }

  if (!post) {
    return <div className="flex min-h-full items-center justify-center bg-slate-50 text-[13px] text-slate-400">불러오는 중…</div>;
  }

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-lg px-4 pb-24 pt-6 sm:px-6">
        <button
          onClick={() => router.back()}
          className="mb-4 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          aria-label="뒤로"
        >
          <ChevronLeft size={17} />
        </button>

        {post.images.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-2xl">
            {post.images.length === 1 ? (
              <button onClick={() => setLightboxIndex(0)} aria-label="사진 크게 보기" className="block w-full bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL */}
                <img src={post.images[0]} alt="" className="max-h-[70vh] w-full object-contain" />
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {post.images.map((url, i) => (
                  <button
                    key={url}
                    onClick={() => setLightboxIndex(i)}
                    aria-label="사진 크게 보기"
                    className={i === 0 && post.images.length === 3 ? "col-span-2" : ""}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL */}
                    <img src={url} alt="" className="h-40 w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-slate-400">
            <span className="font-semibold text-indigo-500">{communityCategoryLabel(post.category)}</span>
            {" · "}
            <button onClick={() => setProfileUserId(post.authorId)} className="font-semibold text-slate-600 hover:underline">
              {post.authorName ?? "여행자"}
            </button>
            {` · ${formatDateLabel(post.createdAt.slice(0, 10))}`}
          </p>
        </div>
        <h1 className="text-xl font-bold tracking-tight">{post.title}</h1>

        {isOwner && (
          <div className="mt-3 space-y-2">
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-slate-500">공개 범위</p>
              <CommunityVisibilitySelector
                value={post.visibility}
                onChange={(v) => handleChangeVisibility(v, post.visibleToUserIds)}
                visibleToUserIds={post.visibleToUserIds}
                onVisibleToUserIdsChange={(ids) => handleChangeVisibility(post.visibility, ids)}
              />
              {togglingVisibility && <p className="mt-1 text-[11px] text-slate-400">변경 중…</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditOpen(true)}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <CordixIcon name="pencil" size={14} /> 수정하기
              </button>
              {confirmingDelete ? (
                <>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex h-10 items-center justify-center rounded-2xl bg-rose-500 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-60"
                  >
                    {deleting ? "삭제 중…" : "삭제 확인"}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-50"
                  >
                    취소
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="글 삭제"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                >
                  <CordixIcon name="trash" size={15} accent="currentColor" />
                </button>
              )}
            </div>
          </div>
        )}

        <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">{post.content}</p>

        <CommunityPostComments
          postId={post.id}
          isOwner={isOwner}
          onRequireLogin={() => setLoginOpen(true)}
        />
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900/90 px-3.5 py-2 text-xs text-white">{toast}</div>
      )}

      {lightboxIndex != null && (
        <PhotoLightbox images={post.images} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
      )}

      {editOpen && (
        <CommunityPostComposer
          existing={post}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            reload();
          }}
        />
      )}

      {loginOpen && <LoginModal reason="댓글을 남기려면 로그인해주세요." onClose={() => setLoginOpen(false)} />}

      {profileUserId != null && <UserProfileSheet userId={profileUserId} onClose={() => setProfileUserId(null)} />}
    </div>
  );
}
