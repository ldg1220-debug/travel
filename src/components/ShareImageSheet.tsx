"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { ShareImageCapture, type ShareImageData } from "@/components/ShareImageCapture";
import { dataUrlToBlob } from "@/lib/dataUrl";
import { uploadReviewPhotos } from "@/lib/api";

type ShareFormat = "story" | "square";
const FORMATS: { value: ShareFormat; label: string }[] = [
  { value: "story", label: "스토리 9:16" },
  { value: "square", label: "정사각 1:1" },
];

/**
 * "카카오톡 공유" 전용 시트 — 포맷 선택(스토리/정사각) → 미리보기 → 확정.
 * "이미지로 저장"(정밀 그리드, `handleCaptureSchedule`)과는 완전히 분리된
 * 별도 경로 — 두 버튼을 하나로 합치지 않기로 한 결정(사용자 피드백)에 따라
 * 이 시트는 카카오 공유 흐름만 담당하고, 확정 시에만 업로드(레이트리밋
 * 20회/10분 소비)한다.
 */
export function ShareImageSheet({
  open,
  data,
  onClose,
  onShareViaKakao,
  onTrack,
}: {
  open: boolean;
  data: ShareImageData;
  onClose: () => void;
  /** Kakao SDK로 실제 전송 — 호출부(PlannerBoard)가 이미 갖고 있는 plan 제목/URL 빌드 로직과 묶여 있어 그쪽에 남겨두고 여기선 완성된 imageUrl만 넘긴다. */
  onShareViaKakao: (imageUrl: string) => Promise<void>;
  onTrack: (format: ShareFormat) => void;
}) {
  const [format, setFormat] = useState<ShareFormat>("story");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleFormatChange = (next: ShareFormat) => {
    if (next === format) return;
    setFormat(next);
    setPreviewUrl(null);
    setError(null);
  };

  const handleConfirm = async () => {
    if (!previewUrl || busy) return;
    setBusy(true);
    setError(null);
    try {
      const blob = dataUrlToBlob(previewUrl);
      const file = new File([blob], `share-${format}.png`, { type: "image/png" });
      const [imageUrl] = await uploadReviewPhotos([file]);
      if (!imageUrl) throw new Error("이미지 업로드에 실패했어요");
      await onShareViaKakao(imageUrl);
      onTrack(format);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "카카오톡 공유에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={busy ? undefined : onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">카카오톡 공유 이미지</p>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-auto p-4">
          <div className="mb-3 flex gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => handleFormatChange(f.value)}
                disabled={busy}
                className={`flex-1 rounded-full py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${
                  format === f.value ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className={`overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 ${format === "story" ? "aspect-[9/16]" : "aspect-square"}`}>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- ephemeral local data URL, not a static asset
              <img src={previewUrl} alt="공유 이미지 미리보기" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center text-[12.5px] text-slate-400">이미지 만드는 중…</div>
            )}
          </div>

          {error && <p className="mt-2 text-[12px] text-rose-500">{error}</p>}

          <button
            onClick={handleConfirm}
            disabled={!previewUrl || busy}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-700 py-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CordixIcon name="share" size={15} stroke="#fff" />
            {busy ? "공유 중…" : "카카오톡 공유"}
          </button>
        </div>
      </div>

      {/* key={format}로 재마운트 — 포맷이 바뀌면 새 크기로 다시 캡처한다. */}
      <ShareImageCapture key={format} data={data} format={format} onCaptured={setPreviewUrl} onError={() => setError("이미지 생성에 실패했어요")} />
    </div>
  );
}
