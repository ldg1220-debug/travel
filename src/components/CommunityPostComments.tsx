"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Trash2 } from "lucide-react";
import { fetchCommunityComments, postCommunityComment, deleteCommunityComment, type CommunityComment } from "@/lib/api";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

/** 커뮤니티 글 댓글 — 그 글을 볼 수 있는 사람만 남길 수 있다(공개범위 기준, 서버가 재검증). 글 주인은 모더레이션 목적으로 누구의 댓글이든 지울 수 있고, 그 외엔 자기 댓글만 지울 수 있다. */
export function CommunityPostComments({
  postId,
  isOwner,
  onRequireLogin,
}: {
  postId: number;
  isOwner: boolean;
  onRequireLogin: () => void;
}) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<CommunityComment[] | null>(null);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCommunityComments(postId).then(setComments);
  }, [postId]);

  const handleSubmit = async () => {
    if (!session?.user) {
      onRequireLogin();
      return;
    }
    const content = text.trim();
    if (!content) return;
    setPosting(true);
    setError(null);
    try {
      const comment = await postCommunityComment(postId, content);
      setComments((prev) => [...(prev ?? []), comment]);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "댓글을 남기지 못했어요");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    setDeletingId(commentId);
    setError(null);
    try {
      await deleteCommunityComment(postId, commentId);
      setComments((prev) => prev?.filter((c) => c.id !== commentId) ?? prev);
    } catch {
      setError("댓글을 삭제하지 못했어요");
    } finally {
      setDeletingId(null);
    }
  };

  const viewerId = session?.user?.id != null ? Number(session.user.id) : null;

  return (
    <div className="mt-6">
      <p className="mb-2 text-[13px] font-bold text-slate-700">댓글{comments && comments.length > 0 ? ` ${comments.length}` : ""}</p>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        {comments == null ? (
          <p className="py-2 text-center text-[12.5px] text-slate-400">불러오는 중…</p>
        ) : comments.length === 0 ? (
          <p className="py-2 text-center text-[12.5px] text-slate-400">아직 댓글이 없어요</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[11px] font-bold text-white">
                {c.authorImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar / uploaded blob URL
                  <img src={c.authorImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  (c.authorName ?? "?").trim().charAt(0).toUpperCase()
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] leading-snug text-slate-700">
                  <span className="font-semibold">{c.authorName ?? "여행자"}</span>{" "}
                  <span className="text-[11px] text-slate-400">{relativeTime(c.createdAt)}</span>
                </p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">{c.content}</p>
              </div>
              {(viewerId === c.userId || isOwner) && (
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={deletingId === c.id}
                  aria-label="댓글 삭제"
                  className="shrink-0 text-slate-300 transition-colors hover:text-rose-400 disabled:opacity-50"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
      {error && <p className="mt-1.5 text-[11.5px] text-rose-500">{error}</p>}
      <div className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={session?.user ? "댓글을 남겨보세요" : "로그인하면 댓글을 남길 수 있어요"}
          className="h-10 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-[13px] outline-none focus:border-indigo-300"
        />
        <button
          onClick={handleSubmit}
          disabled={posting || !text.trim()}
          className="h-10 shrink-0 rounded-2xl bg-indigo-600 px-4 text-[13px] font-semibold text-white transition-opacity hover:bg-indigo-700 disabled:opacity-50"
        >
          {posting ? "등록 중…" : "등록"}
        </button>
      </div>
    </div>
  );
}
