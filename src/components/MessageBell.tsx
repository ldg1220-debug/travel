"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { fetchConversations } from "@/lib/api";

const POLL_INTERVAL_MS = 30_000;

/** 상단바 메시지 아이콘 — 안 읽은 메시지가 있으면 점 배지를 보여준다. 눌러서 /messages로 이동. */
export function MessageBell() {
  const { data: session } = useSession();
  const [unread, setUnread] = useState(0);
  const loggedIn = !!session?.user;

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    const load = () => {
      fetchConversations().then((conversations) => {
        if (!cancelled) setUnread(conversations.reduce((sum, c) => sum + c.unreadCount, 0));
      });
    };
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loggedIn]);

  if (!loggedIn) return null;

  return (
    <Link
      href="/messages"
      aria-label="메시지"
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <CordixIcon name="message" size={18} />
      {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />}
    </Link>
  );
}
