"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { fetchReports, setUserBanned, updateReport, type Report } from "@/lib/api";

const REASON_LABELS: Record<string, string> = {
  spam: "스팸·광고",
  abuse: "욕설·혐오",
  sexual: "음란물",
  illegal: "불법 콘텐츠",
  other: "기타",
};
const TARGET_LABELS: Record<string, string> = {
  trip_post: "여행 후기",
  message: "메시지",
  user: "사용자 프로필",
};
const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "pending", label: "대기" },
  { value: "reviewing", label: "검토 중" },
  { value: "resolved", label: "처리 완료" },
  { value: "dismissed", label: "기각" },
];
const STATUS_OPTIONS = ["pending", "reviewing", "resolved", "dismissed"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 관리자 전용 신고 처리 화면 — 접수된 신고를 훑어보고 상태를 갱신하거나, 신고당한 사용자를 정지/해제할 수 있다. */
export default function AdminReportsPage() {
  const { data: session, status } = useSession();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [tab, setTab] = useState("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    fetchReports().then(setReports);
  };

  useEffect(() => {
    if (session?.user?.isAdmin) load();
  }, [session?.user?.isAdmin]);

  if (status !== "loading" && !session?.user?.isAdmin) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-6 text-center dark:bg-slate-950">
        <p className="text-[13px] text-slate-400">관리자만 접근할 수 있는 화면이에요.</p>
      </div>
    );
  }

  const visible = reports?.filter((r) => tab === "all" || r.status === tab) ?? [];

  const handleStatusChange = async (report: Report, nextStatus: string) => {
    setBusyId(report.id);
    try {
      await updateReport(report.id, { status: nextStatus });
      setReports((prev) => prev?.map((r) => (r.id === report.id ? { ...r, status: nextStatus } : r)) ?? null);
    } finally {
      setBusyId(null);
    }
  };

  const handleBan = async (report: Report, banned: boolean) => {
    if (report.reportedUserId == null) return;
    setBusyId(report.id);
    try {
      await setUserBanned(report.reportedUserId, banned);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-8 sm:px-6">
        <h2 className="mb-5 text-2xl font-bold tracking-tight">신고 관리</h2>

        <div className="mb-4 flex gap-1.5 overflow-x-auto">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                tab === t.value ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {reports == null ? (
          <p className="py-16 text-center text-[13px] text-slate-400">불러오는 중…</p>
        ) : visible.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-slate-400">해당하는 신고가 없어요.</p>
        ) : (
          <div className="space-y-3">
            {visible.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                      {r.reporterNickname ?? "탈퇴한 사용자"} → {r.reportedNickname ?? "탈퇴한 사용자"}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-slate-400">
                      {TARGET_LABELS[r.targetType] ?? r.targetType} #{r.targetId} · {formatDate(r.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                    {REASON_LABELS[r.reason] ?? r.reason}
                  </span>
                </div>
                {r.detail && <p className="mb-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{r.detail}</p>}

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={r.status}
                    disabled={busyId === r.id}
                    onChange={(e) => handleStatusChange(r, e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_TABS.find((t) => t.value === s)?.label ?? s}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleBan(r, true)}
                    disabled={busyId === r.id || r.reportedUserId == null}
                    className="rounded-xl bg-rose-500 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
                  >
                    정지
                  </button>
                  <button
                    onClick={() => handleBan(r, false)}
                    disabled={busyId === r.id || r.reportedUserId == null}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    정지 해제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
