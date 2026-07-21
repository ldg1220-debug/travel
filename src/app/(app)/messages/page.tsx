"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { fetchConversations, type Conversation } from "@/lib/api";
import { LoginModal } from "@/components/LoginModal";

const POLL_INTERVAL_MS = 30_000;

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

/** 메시지 대화 목록 — 트래블 메이트와 주고받은 대화가 최근 순으로 뜬다. 아직 아무 메시지도 없으면 안내만 보여준다(대화 시작은 트래블 메이트 프로필에서). */
export default function MessagesPage() {
  const { data: session, status } = useSession();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    const load = () => {
      fetchConversations().then((data) => {
        if (!cancelled) setConversations(data);
      });
    };
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session?.user]);

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-lg px-4 pb-24 pt-8 sm:px-6">
        <div className="mb-6 flex items-center gap-2">
          <CordixIcon name="message" size={20} stroke="#6366f1" />
          <h2 className="text-2xl font-bold tracking-tight">메시지</h2>
        </div>

        {status !== "loading" && !session?.user ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center dark:border-slate-800 dark:bg-slate-900/40">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
              <CordixIcon name="message" size={24} />
            </span>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">로그인이 필요해요</p>
            <p className="mt-1 text-[13px] text-slate-400">트래블 메이트와 메시지를 주고받으려면 로그인해주세요.</p>
            <button
              onClick={() => setLoginOpen(true)}
              className="mt-5 rounded-full bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700"
            >
              로그인하기
            </button>
          </div>
        ) : conversations == null ? (
          <div className="py-24 text-center text-[13px] text-slate-400">불러오는 중…</div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center dark:border-slate-800 dark:bg-slate-900/40">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
              <CordixIcon name="message" size={24} />
            </span>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">아직 주고받은 메시지가 없어요</p>
            <p className="mt-1 text-[13px] text-slate-400">트래블 메이트의 프로필에서 메시지를 보내보세요.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((c) => (
              <Link
                key={c.userId}
                href={`/messages/${c.userId}`}
                className="flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-slate-100 dark:hover:bg-slate-900"
              >
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar / uploaded blob URL
                  <img src={c.image} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 text-sm font-bold text-white">
                    {(c.nickname ?? "여").trim().charAt(0)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[14px] font-bold text-slate-900 dark:text-slate-100">{c.nickname ?? "여행자"}</p>
                    <span className="shrink-0 text-[11px] text-slate-400">{relativeTime(c.lastMessageAt)}</span>
                  </div>
                  <p
                    className={`truncate text-[13px] ${
                      c.unreadCount > 0 ? "font-semibold text-slate-700 dark:text-slate-200" : "text-slate-400"
                    }`}
                  >
                    {c.lastSenderId === Number(session?.user?.id) ? "나: " : ""}
                    {c.lastMessageDeleted ? "삭제된 메시지예요" : c.lastMessage}
                  </p>
                </div>
                {c.unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10.5px] font-bold text-white">
                    {c.unreadCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {loginOpen && <LoginModal reason="트래블 메이트와 메시지를 주고받으려면 로그인해주세요." onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
