"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  fetchItineraryRevisionDetail,
  fetchItineraryRevisions,
  restoreItineraryRevision,
  type ItineraryRevisionDetail,
  type ItineraryRevisionSummary,
} from "@/lib/api";

/**
 * "변경 내역" — 작업지시서 2026-09-16 "남은 작업 + 데이터 안전장치" §3:
 * itinerary_revisions(#258)가 그동안 쌓이기만 하고 사용자가 꺼내 볼
 * 방법이 없었다("오늘 같은 일이 또 나면 여전히 제가 수동으로
 * 되살려야 합니다"). AppBar.tsx의 계획 미리보기(previewPlan)에서 열리며,
 * 목록엔 제목·시각·스팟 수만 보여준다(전체 일정은 실제로 되돌리기 전엔
 * 필요 없다) — 각 항목의 "이 시점으로 되돌리기"는 한 번 더 확인을 거친
 * 뒤 서버에 위임한다(복원 자체도 새 이력으로 남아 되돌릴 수 있다).
 *
 * 작업지시서 2026-09-18 "뷰어 모드를 우회하는 저장 경로" §7 — "되돌리기
 * 전에 '무엇으로 돌아가는지' 볼 수 있어야 합니다": 확인 단계에서 스팟
 * 목록을 펼쳐 보여준다(fetchItineraryRevisionDetail). "되돌리기로
 * 생성됨" 표시(createdBy)도 함께 넣어, 목록에 왜 이 항목이 있는지
 * 헷갈리지 않게 한다.
 */
export function RevisionHistorySheet({
  itineraryId,
  onClose,
  onRestored,
}: {
  itineraryId: number;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [revisions, setRevisions] = useState<ItineraryRevisionSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [preview, setPreview] = useState<ItineraryRevisionDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [restoreError, setRestoreError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchItineraryRevisions(itineraryId)
      .then((r) => {
        if (!cancelled) setRevisions(r);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [itineraryId]);

  const openConfirm = (revisionId: number) => {
    setConfirmId(revisionId);
    setPreview(null);
    setPreviewLoading(true);
    fetchItineraryRevisionDetail(itineraryId, revisionId)
      .then(setPreview)
      .catch(() => {})
      .finally(() => setPreviewLoading(false));
  };

  const handleRestore = async (revisionId: number) => {
    setRestoringId(revisionId);
    setRestoreError(false);
    try {
      await restoreItineraryRevision(itineraryId, revisionId);
      onRestored();
    } catch {
      setRestoreError(true);
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:bg-slate-900">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="text-[14px] font-bold text-slate-900 dark:text-slate-100">변경 내역</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {revisions == null && !loadError && <p className="py-6 text-center text-[12.5px] text-slate-400">불러오는 중…</p>}
          {loadError && <p className="py-6 text-center text-[12.5px] text-rose-500">변경 내역을 불러오지 못했어요</p>}
          {revisions != null && revisions.length === 0 && (
            <p className="py-6 text-center text-[12.5px] text-slate-400">아직 저장된 변경 내역이 없어요</p>
          )}
          {revisions?.map((rev) => (
            <div key={rev.id} className="border-b border-slate-50 py-2.5 last:border-0 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-700 dark:text-slate-200">{rev.title}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatRevisionTimestamp(rev.createdAt)} · {rev.itemCount}곳
                    {rev.createdBy === "restore" && <span className="ml-1 text-amber-600">· 되돌리기 전 상태</span>}
                  </p>
                </div>
                {confirmId === rev.id ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => handleRestore(rev.id)}
                      disabled={restoringId === rev.id}
                      className="rounded-full bg-brand-700 px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-60"
                    >
                      {restoringId === rev.id ? "되돌리는 중…" : "확인"}
                    </button>
                    <button onClick={() => setConfirmId(null)} className="text-[11.5px] text-slate-400">
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => openConfirm(rev.id)}
                    className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    이 시점으로 되돌리기
                  </button>
                )}
              </div>
              {confirmId === rev.id && (
                <div className="mt-2 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                  <p className="mb-1 text-[11px] font-semibold text-slate-500">이 내용으로 돌아갑니다</p>
                  {previewLoading && <p className="text-[11.5px] text-slate-400">불러오는 중…</p>}
                  {!previewLoading && preview && (
                    <ol className="space-y-0.5">
                      {preview.placesData.slice(0, 8).map((item) => (
                        <li key={item.id} className="truncate text-[11.5px] text-slate-600 dark:text-slate-300">
                          · {item.name}
                        </li>
                      ))}
                      {preview.placesData.length > 8 && (
                        <li className="text-[11px] text-slate-400">외 {preview.placesData.length - 8}곳</li>
                      )}
                    </ol>
                  )}
                </div>
              )}
            </div>
          ))}
          {restoreError && <p className="py-2 text-center text-[11.5px] text-rose-500">되돌리지 못했어요 — 다시 시도해주세요</p>}
        </div>
      </div>
    </div>
  );
}

function formatRevisionTimestamp(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
