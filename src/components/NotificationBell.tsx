"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bell } from "lucide-react";
import { fetchNotifications, markNotificationsRead, type AppNotification } from "@/lib/api";
import { UserProfileSheet } from "@/components/UserProfileSheet";

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

/** 우측 상단 알림 벨 — 다른 사람이 나를 팔로우하거나 내 후기에 좋아요를 누르면 여기 쌓인다. 로그아웃 상태면 아예 렌더링하지 않는다. */
export function NotificationBell() {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  const loggedIn = !!session?.user;

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    const load = () => {
      fetchNotifications().then((data) => {
        if (!cancelled) {
          setNotifications(data.notifications);
          setUnreadCount(data.unreadCount);
        }
      });
    };
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loggedIn]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      markNotificationsRead();
    }
  };

  const handleItemClick = (n: AppNotification) => {
    setOpen(false);
    if (n.postId != null) router.push(`/trip/${n.postId}`);
    else setProfileUserId(n.actorId);
  };

  if (!loggedIn) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        aria-label="알림"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-[70] max-h-[70vh] w-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl sm:w-80 dark:border-slate-700 dark:bg-slate-900">
          <p className="px-3.5 py-2 text-[13px] font-bold text-slate-800 dark:text-slate-100">알림</p>
          {notifications.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-[12.5px] text-slate-400">아직 알림이 없어요</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  n.read ? "" : "bg-indigo-50/60 dark:bg-indigo-500/10"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">
                  {n.actorImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar / uploaded blob URL
                    <img src={n.actorImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (n.actorName ?? "?").trim().charAt(0).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] leading-snug text-slate-700 dark:text-slate-200">
                    <span className="font-semibold">{n.actorName ?? "여행자"}</span>
                    {n.type === "follow" ? "님이 회원님에게 트메를 신청했어요" : "님이 회원님의 후기에 좋아요를 눌렀어요"}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">{relativeTime(n.createdAt)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {profileUserId != null && <UserProfileSheet userId={profileUserId} onClose={() => setProfileUserId(null)} />}
    </div>
  );
}
