"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronLeft, Send } from "lucide-react";
import { fetchThread, fetchUserProfile, sendMessage, type ChatMessage, type UserProfile } from "@/lib/api";

const POLL_INTERVAL_MS = 4_000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

/** 1:1 메시지 대화 화면 — 트래블 메이트하고만 새 메시지를 보낼 수 있다(메이트 관계가 끊긴 뒤에도 기존 대화 기록은 계속 읽을 수 있음). */
export default function MessageThreadPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const otherId = Number(params.userId);
  const viewerId = session?.user?.id != null ? Number(session.user.id) : null;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!otherId) return;
    fetchUserProfile(otherId).then(setProfile);
  }, [otherId]);

  useEffect(() => {
    if (!otherId || !viewerId) return;
    let cancelled = false;
    const load = () => {
      fetchThread(otherId).then((data) => {
        if (!cancelled) setMessages(data);
      });
    };
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [otherId, viewerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendMessage(otherId, content);
      setMessages((prev) => [...(prev ?? []), sent]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "메시지를 보내지 못했어요");
    } finally {
      setSending(false);
    }
  };

  if (!otherId) return null;

  return (
    <div className="flex min-h-full flex-col bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <button
          onClick={() => router.push("/messages")}
          aria-label="뒤로"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ChevronLeft size={18} />
        </button>
        {profile?.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar / uploaded blob URL
          <img src={profile.image} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 text-xs font-bold text-white">
            {(profile?.nickname ?? "여").trim().charAt(0)}
          </span>
        )}
        <span className="truncate text-[14.5px] font-bold">{profile?.nickname ?? "여행자"}</span>
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-2 overflow-y-auto px-4 py-5">
        {messages == null ? (
          <p className="py-16 text-center text-[13px] text-slate-400">불러오는 중…</p>
        ) : messages.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-slate-400">
            {profile?.nickname ?? "여행자"}님과의 첫 메시지를 보내보세요.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === viewerId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`flex max-w-[75%] items-end gap-1.5 ${mine ? "flex-row-reverse" : "flex-row"}`}>
                  <p
                    className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                      mine
                        ? "rounded-br-md bg-indigo-600 text-white"
                        : "rounded-bl-md bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200"
                    }`}
                  >
                    {m.content}
                  </p>
                  <span className="shrink-0 pb-0.5 text-[10px] text-slate-400">{formatTime(m.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 border-t border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex w-full max-w-lg items-end gap-2">
          {profile && !profile.isFriend ? (
            <p className="flex-1 py-2.5 text-center text-[12.5px] text-slate-400">트래블 메이트에게만 메시지를 보낼 수 있어요</p>
          ) : (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="메시지 보내기"
                rows={1}
                className="min-h-11 flex-1 resize-none rounded-2xl border border-slate-200 px-3.5 py-2.5 text-[13.5px] outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                aria-label="보내기"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-opacity hover:bg-indigo-700 disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </>
          )}
        </div>
        {error && <p className="mt-1.5 text-center text-[11.5px] text-rose-500">{error}</p>}
      </div>
    </div>
  );
}
