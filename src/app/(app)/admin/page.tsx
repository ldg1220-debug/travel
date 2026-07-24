"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { fetchAdminStats, sendAnnouncement, type AdminStats } from "@/lib/api";

const ANNOUNCEMENT_MAX_LENGTH = 300;

/** 관리자/부관리자 전체 공지 발송 — 알림 벨의 "공지" 탭에 쌓인다. */
function AnnouncementForm() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    if (!window.confirm(`정말 전체 사용자에게 이 공지를 보낼까요?\n\n"${trimmed}"`)) return;

    setSending(true);
    setError(null);
    setResult(null);
    try {
      const { count } = await sendAnnouncement(trimmed);
      setMessage("");
      setResult(`${count.toLocaleString()}명에게 공지를 보냈어요`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "공지 발송에 실패했어요");
    } finally {
      setSending(false);
    }
  };

  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold text-slate-500">전체 공지 발송</h2>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, ANNOUNCEMENT_MAX_LENGTH))}
          placeholder="전체 사용자의 알림 벨에 보낼 공지 내용을 입력하세요"
          rows={3}
          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {message.length}/{ANNOUNCEMENT_MAX_LENGTH}
          </span>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="rounded-full bg-indigo-600 px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {sending ? "발송 중…" : "전체 발송"}
          </button>
        </div>
        {result && <p className="mt-2 text-[12px] font-medium text-emerald-600">{result}</p>}
        {error && <p className="mt-2 text-[12px] text-rose-500">{error}</p>}
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[12px] font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value.toLocaleString()}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

/** 일별 신규가입 추이 — 별도 차트 라이브러리 없이 막대 높이로만 표시. */
function SignupTrendChart({ trend }: { trend: AdminStats["signupTrend"] }) {
  const max = Math.max(1, ...trend.map((t) => t.count));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[12px] font-medium text-slate-400">최근 14일 가입 추이</p>
      <div className="mt-3 flex h-24 items-end gap-1">
        {trend.map((t) => (
          <div key={t.date} className="group relative flex-1">
            <div
              className="mx-auto w-full rounded-t bg-indigo-500 transition-colors group-hover:bg-indigo-600"
              style={{ height: `${Math.max(4, (t.count / max) * 96)}px` }}
            />
            <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
              {formatDate(t.date)} · {t.count}명
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
        <span>{formatDate(trend[0].date)}</span>
        <span>{formatDate(trend[trend.length - 1].date)}</span>
      </div>
    </div>
  );
}

/** 관리자 대시보드 — 가입 추이·활성 사용자·서비스 이용량을 한눈에. */
export default function AdminDashboardPage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user?.isAdmin) {
      fetchAdminStats()
        .then(setStats)
        .finally(() => setLoading(false));
    }
  }, [session?.user?.isAdmin]);

  if (status !== "loading" && !session?.user?.isAdmin) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-6 text-center dark:bg-slate-950">
        <p className="text-[13px] text-slate-400">관리자만 접근할 수 있는 화면이에요.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 px-4 pb-24 pt-6 dark:bg-slate-950 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">관리자 대시보드</h1>
        <p className="mt-0.5 text-[12.5px] text-slate-400">
          유입(가입)과 활성 사용자, 서비스 이용량을 확인할 수 있어요. 로그인하지 않은 순수 방문자 수는 여기 포함되지
          않아요 — 그건 Vercel Analytics에서 확인하시는 게 정확해요.
        </p>

        {loading || !stats ? (
          <p className="mt-10 text-center text-[13px] text-slate-400">불러오는 중…</p>
        ) : (
          <div className="mt-5 space-y-5">
            <AnnouncementForm />

            {/* 유입 — 가입자 수 */}
            <section>
              <h2 className="mb-2 text-[13px] font-semibold text-slate-500">유입 (가입자)</h2>
              <div className="grid grid-cols-3 gap-2.5">
                <StatCard label="오늘 신규가입" value={stats.newUsers.today} />
                <StatCard label="최근 7일" value={stats.newUsers.last7} />
                <StatCard label="최근 30일" value={stats.newUsers.last30} />
              </div>
              <div className="mt-2.5">
                <StatCard label="전체 가입자" value={stats.totalUsers} />
              </div>
              <div className="mt-2.5">
                <SignupTrendChart trend={stats.signupTrend} />
              </div>
            </section>

            {/* 활성 사용자 */}
            <section>
              <h2 className="mb-2 text-[13px] font-semibold text-slate-500">
                활성 사용자
                <span className="ml-1.5 font-normal text-slate-400">(대략 5분 단위로 집계돼요)</span>
              </h2>
              <div className="grid grid-cols-3 gap-2.5">
                <StatCard label="최근 24시간" value={stats.activeUsers.last1} />
                <StatCard label="최근 7일" value={stats.activeUsers.last7} />
                <StatCard label="최근 30일" value={stats.activeUsers.last30} />
              </div>
            </section>

            {/* 서비스 이용량 */}
            <section>
              <h2 className="mb-2 text-[13px] font-semibold text-slate-500">서비스 이용량 (누적)</h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <StatCard label="저장된 계획" value={stats.engagement.savedPlans} />
                <StatCard label="여행 후기" value={stats.engagement.tripPosts} />
                <StatCard label="장소 리뷰" value={stats.engagement.reviews} />
                <StatCard label="메시지" value={stats.engagement.messages} />
                <StatCard label="트래블 메이트 연결" value={stats.engagement.mateConnections} />
              </div>
            </section>

            {/* 최근 가입자 */}
            <section>
              <h2 className="mb-2 text-[13px] font-semibold text-slate-500">최근 가입한 사용자</h2>
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {stats.recentSignups.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-slate-400">아직 가입자가 없어요</p>
                ) : (
                  stats.recentSignups.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                      {u.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external OAuth avatar URL
                        <img src={u.image} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-semibold text-slate-500 dark:bg-slate-800">
                          {u.name.slice(0, 1)}
                        </div>
                      )}
                      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">{u.name}</p>
                      <p className="shrink-0 text-[11px] tabular-nums text-slate-400">{formatDateTime(u.createdAt)}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
