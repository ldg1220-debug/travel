"use client";

import { useMemo, useState } from "react";
import { X, Copy, Check, ExternalLink } from "lucide-react";
import type { TripPostPlaceReview } from "@/lib/api";

interface ExportPostModalProps {
  title: string;
  content: string;
  images: string[];
  placeReviews: TripPostPlaceReview[];
  url: string;
  authorName: string | null;
  isOwner: boolean;
  onClose: () => void;
}

interface ExportPhoto {
  url: string;
  label: string;
}

// 클립보드 이미지 쓰기(ClipboardItem)는 브라우저별로 png만 확실히 지원돼서
// jpeg 원본은 캔버스를 거쳐 png로 바꾼 뒤에 넣는다.
async function toPngBlob(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context를 만들 수 없어요");
  ctx.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png 변환에 실패했어요"))), "image/png");
  });
}

/**
 * "내보내기" — 티스토리는 2024년 Open API를 완전히 종료했고 네이버 블로그
 * 글쓰기 API는 사업자 심사가 필요해서, 둘 다 자동 발행 대신 서식을 갖춘
 * 텍스트를 복사해 직접 붙여넣는 방식으로 대신한다. 본인 글이 아니면 원작자
 * 출처 문구를 본문 앞에 자동으로 붙여 무단 재게시처럼 보이지 않게 한다.
 *
 * 사진은 다운로드를 강제하지 않는다 — 새 탭에서 원본을 바로 볼 수 있는
 * 공개 링크(/api/blob 프록시, 인증 불필요)라서 눌러서 보거나 링크만 복사해
 * 블로그에 붙여넣을 수 있게 한다. 그리고 본인 글이든 남의 글이든 내보낸
 * 텍스트 맨 아래에 트레쥴 링크를 항상 붙여, 외부 블로그에 올려도 트레쥴로
 * 유입될 수 있게 한다.
 */
export function ExportPostModal({ title, content, images, placeReviews, url, authorName, isOwner, onClose }: ExportPostModalProps) {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [copiedPhotoIndex, setCopiedPhotoIndex] = useState<number | null>(null);
  const [photoCopyMode, setPhotoCopyMode] = useState<"image" | "link" | null>(null);

  // /api/upload가 돌려주는 사진 URL은 도메인 없는 상대 경로(/api/blob/...)라
  // 우리 앱 안에서는 문제없이 뜨지만, 그대로 텍스트로 복사해 티스토리·네이버
  // 같은 외부 사이트에 붙여넣으면 어떤 도메인 것인지 알 수 없어 깨진다 —
  // 원본 origin을 붙여 완전한 URL로 만들어준다.
  const photos = useMemo<ExportPhoto[]>(() => {
    const toAbsolute = (photoUrl: string) => (/^https?:\/\//.test(photoUrl) ? photoUrl : `${window.location.origin}${photoUrl}`);
    return [
      ...images.map((photoUrl, i) => ({ url: toAbsolute(photoUrl), label: `대표 사진 ${i + 1}` })),
      ...placeReviews.flatMap((r) => r.images.map((photoUrl, i) => ({ url: toAbsolute(photoUrl), label: `${r.placeName} 사진 ${i + 1}` }))),
    ];
  }, [images, placeReviews]);

  const hashtags = useMemo(() => Array.from(new Set(content.match(/#\S+/g) ?? [])), [content]);

  const exportText = useMemo(() => {
    const attribution = isOwner
      ? ""
      : `이 글은 ${authorName ?? "여행자"}님이 트레쥴에 작성한 여행 후기를 바탕으로 재구성했습니다. 원문 보기: ${url}\n\n`;
    const placeReviewsBlock =
      placeReviews.length > 0
        ? `\n\n다녀온 장소\n${placeReviews.map((r) => `- ${r.placeName} (⭐${r.rating.toFixed(1)}) ${r.content}`).join("\n")}`
        : "";
    const hashtagsBlock = hashtags.length > 0 ? `\n\n${hashtags.join(" ")}` : "";
    const footer = `\n\n✈️ 트레쥴(Tradule)에서 계획하고 기록한 여행이에요\n${url}`;
    return `${title}\n\n${attribution}${content}${placeReviewsBlock}${hashtagsBlock}${footer}`;
  }, [title, content, placeReviews, hashtags, isOwner, authorName, url]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleCopyLinkOnly = async () => {
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1600);
  };

  // 링크를 텍스트로 복사하면 블로그 에디터가 파란 글자 링크로만 보여주고
  // 사진으로 삽입해주지 않는다(에디터 자체 동작이라 우리가 바꿀 수 없음).
  // 대신 이미지 자체를 클립보드에 담아서 Ctrl+V로 바로 삽입되게 한다 —
  // 지원하지 않는 브라우저에서는 링크 복사로 대체한다.
  const handleCopyPhoto = async (photoUrl: string, index: number) => {
    try {
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
        throw new Error("이 브라우저는 이미지 클립보드 복사를 지원하지 않아요");
      }
      const res = await fetch(photoUrl);
      const blob = await res.blob();
      const pngBlob = blob.type === "image/png" ? blob : await toPngBlob(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      setPhotoCopyMode("image");
    } catch {
      await navigator.clipboard.writeText(photoUrl);
      setPhotoCopyMode("link");
    }
    setCopiedPhotoIndex(index);
    setTimeout(() => setCopiedPhotoIndex(null), 1600);
  };

  const handleNaver = () => {
    const naverUrl = `https://share.naver.com/web/shareView?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
    window.open(naverUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-[420px] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:bg-slate-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[14px] font-bold text-slate-800 dark:text-slate-100">내보내기</p>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {!isOwner && (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              본인이 쓴 글이 아니라서, 복사할 때 원작자 출처가 자동으로 함께 붙어요.
            </p>
          )}
          <textarea
            readOnly
            value={exportText}
            rows={8}
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          />
          <p className="mt-1.5 text-[11px] text-slate-400">
            텍스트에는 본문·다녀온 장소 리뷰·해시태그·트레쥴 링크가 포함돼요. 사진은 텍스트에 자동으로 들어가지
            않으니 아래에서 따로 복사해주세요.
          </p>

          {photos.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[12px] font-semibold text-slate-500">
                사진 {photos.length}장 — 아이콘을 누르면 사진이 복사돼요, 블로그 글쓰기 화면에서 Ctrl+V(붙여넣기)하면 바로
                삽입돼요
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((photo, i) => (
                  <div key={`${photo.url}-${i}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <a href={photo.url} target="_blank" rel="noreferrer" aria-label={`${photo.label} 원본 보기`} className="block h-full w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element -- own blob proxy URL, publicly viewable */}
                      <img src={photo.url} alt="" className="h-full w-full object-cover" />
                    </a>
                    <button
                      onClick={() => handleCopyPhoto(photo.url, i)}
                      aria-label={`${photo.label} 복사`}
                      className="absolute bottom-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-white transition-colors hover:bg-black/80"
                    >
                      {copiedPhotoIndex === i ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  </div>
                ))}
              </div>
              {copiedPhotoIndex != null && (
                <p className="mt-1 text-[11px] text-emerald-600">
                  {photoCopyMode === "image" ? "사진이 복사됐어요 — 블로그 글쓰기 화면에서 Ctrl+V로 붙여넣어주세요" : "이 브라우저는 이미지 복사를 지원하지 않아 링크로 복사했어요"}
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={handleCopy}
              className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-slate-900 text-[13px] font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            >
              <Copy size={15} /> {copied ? "복사됐어요!" : "텍스트 복사하기"}
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleCopyLinkOnly}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <Copy size={15} /> {linkCopied ? "복사됐어요!" : "링크만 복사"}
              </button>
              <button
                onClick={handleNaver}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <ExternalLink size={15} /> 네이버 새 글
              </button>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            티스토리는 자동 등록 기능이 막혀 있어(2024년 API 종료) 복사한 텍스트를 직접 붙여넣어야 해요. 네이버는
            제목·링크까지만 채워지니, 본문은 복사한 텍스트를 붙여넣어 완성해주세요.
          </p>
        </div>
      </div>
    </div>
  );
}
