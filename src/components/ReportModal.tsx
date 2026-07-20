"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { submitReport, type ReportReason, type ReportTargetType } from "@/lib/api";

const REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "스팸·광고" },
  { value: "abuse", label: "욕설·혐오·차별 표현" },
  { value: "sexual", label: "음란물" },
  { value: "illegal", label: "불법 콘텐츠(아동 대상 성적 콘텐츠 등)" },
  { value: "other", label: "기타" },
];

/**
 * 여행 후기·메시지·사용자 프로필을 관리자에게 신고하는 공용 팝업. 신고
 * 사유를 고르고(필수) 상세 설명을 덧붙일 수 있다(선택) — 접수 즉시
 * /admin/reports 목록에 뜬다.
 */
export function ReportModal({
  targetType,
  targetId,
  onClose,
}: {
  targetType: ReportTargetType;
  targetId: number;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitReport({ targetType, targetId, reason, detail: detail.trim() || undefined });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "신고를 접수하지 못했어요");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl dark:bg-slate-900">
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X size={16} />
        </button>

        {done ? (
          <div className="py-8 text-center">
            <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">신고가 접수됐어요</p>
            <p className="mt-1.5 text-[12.5px] text-slate-400">검토 후 필요한 조치를 취할게요.</p>
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-2xl bg-slate-900 py-2.5 text-[13px] font-semibold text-white dark:bg-white dark:text-slate-900"
            >
              닫기
            </button>
          </div>
        ) : (
          <>
            <h3 className="mb-4 text-[15px] font-bold text-slate-900 dark:text-slate-100">신고하기</h3>
            <div className="space-y-1.5">
              {REASON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setReason(opt.value)}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors ${
                    reason === opt.value
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="상세 설명(선택)"
              rows={3}
              maxLength={500}
              className="mt-3 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {error && <p className="mt-2 text-[11.5px] text-rose-500">{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={!reason || submitting}
              className="mt-4 w-full rounded-2xl bg-rose-500 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
            >
              {submitting ? "접수 중…" : "신고 접수"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
