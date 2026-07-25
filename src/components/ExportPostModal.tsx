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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 순수 텍스트로 복사하면 사진 URL이 대상 에디터(구글독스/노션/워드/지메일 등)에서
// 그냥 파란 글자 링크로만 보이고 사진으로 삽입되지 않는다 — text/html도 함께 담아
// <img> 태그를 넣어두면, HTML 붙여넣기를 지원하는 에디터는 그 URL의 사진을 그대로
// 가져와 삽입해준다. text/html을 못 쓰는 환경(구형 브라우저 등)에서는 text/plain
// 으로만 대체된다.
async function copyRichText(text: string, html: string): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return;
    } catch {
      // 아래 텍스트 전용 복사로 대체
    }
  }
  await navigator.clipboard.writeText(text);
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

/** 섹션별로 따로 복사할 수 있게 하는 작은 텍스트 복사 버튼 — 제목/글/해시태그/장소 리뷰가 각각 블로그의 다른 입력칸(제목 칸, 본문 등)에 들어가야 해서 하나로 뭉쳐 복사하면 오히려 지우고 나눠야 하는 수고가 생긴다. `html`을 함께 주면 사진이 실제로 삽입되는 붙여넣기(리치 텍스트 대상)도 같이 지원한다. */
function CopyTextButton({ text, html, label = "복사" }: { text: string; html?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    if (html) await copyRichText(text, html);
    else await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button
      onClick={handle}
      className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? "복사됨" : label}
    </button>
  );
}

function PhotoRow({
  photos,
  copiedUrl,
  copyMode,
  onCopy,
}: {
  photos: ExportPhoto[];
  copiedUrl: string | null;
  copyMode: "image" | "link" | null;
  onCopy: (photo: ExportPhoto) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((photo) => (
        <div key={photo.url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <a href={photo.url} target="_blank" rel="noreferrer" aria-label={`${photo.label} 원본 보기`} className="block h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- own blob proxy URL, publicly viewable */}
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
          </a>
          <button
            onClick={() => onCopy(photo)}
            aria-label={`${photo.label} 복사`}
            className="absolute bottom-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-white transition-colors hover:bg-black/80"
          >
            {copiedUrl === photo.url ? <Check size={11} /> : <Copy size={11} />}
          </button>
        </div>
      ))}
      {copiedUrl != null && photos.some((p) => p.url === copiedUrl) && (
        <p className="w-full text-[11px] text-emerald-600">
          {copyMode === "image" ? "사진이 복사됐어요 — 그 자리에서 Ctrl+V로 붙여넣어주세요" : "이 브라우저는 이미지 복사를 지원하지 않아 링크로 복사했어요"}
        </p>
      )}
    </div>
  );
}

/**
 * "내보내기" — 티스토리는 2024년 Open API를 완전히 종료했고 네이버 블로그
 * 글쓰기 API는 사업자 심사가 필요해서, 둘 다 자동 발행 대신 서식을 갖춘
 * 텍스트를 복사해 직접 붙여넣는 방식으로 대신한다. 본인 글이 아니면 원작자
 * 출처 문구를 본문 앞에 자동으로 붙여 무단 재게시처럼 보이지 않게 한다.
 *
 * 제목/본문은 보통 블로그 에디터에서 서로 다른 입력칸이라 "제목 → 글 → 대표
 * 사진 → 다녀온 장소(별점 아래 그 장소 사진) → 해시태그" 순서로 섹션을
 * 나누고 각각 따로 복사할 수 있게 했다 — 통째로 복사하면 제목 줄을 지우고
 * 다시 나누는 수고가 생기기 때문. 개별 사진은 클립보드 이미지 복사(Ctrl+V 삽입)로,
 * 장소 리뷰 글+사진 묶음은 text/html에 <img>를 담은 리치 텍스트 복사로 실제 사진이
 * 삽입되게 한다 — 순수 텍스트로만 복사하면 리치 에디터에서도 URL이 파란 글자
 * 링크로만 보이고 사진으로 렌더링되지 않기 때문(에디터가 URL을 자동으로 이미지
 * embedding해주지는 않지만, text/html 클립보드 데이터 안의 <img src>는 대부분의
 * 리치 텍스트 에디터가 그대로 가져와 삽입해준다).
 */
export function ExportPostModal({ title, content, images, placeReviews, url, authorName, isOwner, onClose }: ExportPostModalProps) {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [copiedPhotoUrl, setCopiedPhotoUrl] = useState<string | null>(null);
  const [photoCopyMode, setPhotoCopyMode] = useState<"image" | "link" | null>(null);

  // /api/upload가 돌려주는 사진 URL은 도메인 없는 상대 경로(/api/blob/...)라
  // 우리 앱 안에서는 문제없이 뜨지만, 그대로 텍스트로 복사해 티스토리·네이버
  // 같은 외부 사이트에 붙여넣으면 어떤 도메인 것인지 알 수 없어 깨진다 —
  // 원본 origin을 붙여 완전한 URL로 만들어준다.
  const toAbsolute = (photoUrl: string) => (/^https?:\/\//.test(photoUrl) ? photoUrl : `${window.location.origin}${photoUrl}`);

  const repPhotos = useMemo<ExportPhoto[]>(
    () => images.map((photoUrl, i) => ({ url: toAbsolute(photoUrl), label: `대표 사진 ${i + 1}` })),
    [images],
  );

  const hashtags = useMemo(() => Array.from(new Set(content.match(/#\S+/g) ?? [])), [content]);

  // 장소마다 리뷰 글+사진을 한 덩어리로 만들어 두고, 개별 카드의 복사 버튼과
  // "다녀온 장소 전체 복사" 버튼이 같은 텍스트/HTML을 재사용하게 한다. html은
  // <img> 태그로 사진을 담아 리치 텍스트 붙여넣기 시 실제 사진으로 보이게 한다.
  const placeReviewBlocks = useMemo(
    () =>
      placeReviews.map((r) => {
        const photos = r.images.map((photoUrl, i) => ({ url: toAbsolute(photoUrl), label: `${r.placeName} 사진 ${i + 1}` }));
        const text = [`${r.placeName} (⭐${r.rating.toFixed(1)}) ${r.content}`, ...photos.map((p) => p.url)].join("\n");
        const html = `<p><strong>${escapeHtml(r.placeName)}</strong> ⭐${r.rating.toFixed(1)}<br>${escapeHtml(r.content).replace(/\n/g, "<br>")}</p>${photos.map((p) => `<p><img src="${p.url}" alt="${escapeHtml(r.placeName)}" style="max-width:100%"></p>`).join("")}`;
        return { review: r, photos, text, html };
      }),
    [placeReviews],
  );
  const allPlaceReviewsText = placeReviewBlocks.map((b) => b.text).join("\n\n");
  const allPlaceReviewsHtml = placeReviewBlocks.map((b) => b.html).join("");

  const attribution = isOwner
    ? ""
    : `이 글은 ${authorName ?? "여행자"}님이 트레쥴에 작성한 여행 후기를 바탕으로 재구성했습니다. 원문 보기: ${url}\n\n`;
  const bodyText = `${attribution}${content}`;
  const hashtagsText = hashtags.join(" ");
  const footerText = `✈️ 트레쥴(Tradule)에서 계획하고 기록한 여행이에요\n${url}`;

  const exportText = useMemo(() => {
    const placeReviewsBlock =
      placeReviews.length > 0
        ? `\n\n다녀온 장소\n${placeReviews.map((r) => `- ${r.placeName} (⭐${r.rating.toFixed(1)}) ${r.content}`).join("\n")}`
        : "";
    const hashtagsBlock = hashtags.length > 0 ? `\n\n${hashtagsText}` : "";
    return `${title}\n\n${bodyText}${placeReviewsBlock}${hashtagsBlock}\n\n${footerText}`;
  }, [title, bodyText, placeReviews, hashtags, hashtagsText, footerText]);

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
  const handleCopyPhoto = async (photo: ExportPhoto) => {
    try {
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
        throw new Error("이 브라우저는 이미지 클립보드 복사를 지원하지 않아요");
      }
      const res = await fetch(photo.url);
      const blob = await res.blob();
      const pngBlob = blob.type === "image/png" ? blob : await toPngBlob(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      setPhotoCopyMode("image");
    } catch {
      await navigator.clipboard.writeText(photo.url);
      setPhotoCopyMode("link");
    }
    setCopiedPhotoUrl(photo.url);
    setTimeout(() => setCopiedPhotoUrl(null), 1600);
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

        <div className="space-y-4 px-5 py-4">
          {!isOwner && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              본인이 쓴 글이 아니라서, 글 복사에 원작자 출처가 자동으로 함께 붙어요.
            </p>
          )}

          {/* 제목 */}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-slate-500">제목</p>
              <CopyTextButton text={title} />
            </div>
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {title}
            </p>
          </div>

          {/* 글 */}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-slate-500">글</p>
              <CopyTextButton text={bodyText} />
            </div>
            <textarea
              readOnly
              value={bodyText}
              rows={6}
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            />
          </div>

          {/* 대표 사진 */}
          {repPhotos.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-slate-500">대표 사진 {repPhotos.length}장</p>
                <CopyTextButton text={repPhotos.map((p) => p.url).join("\n")} label="URL 전체 복사" />
              </div>
              <PhotoRow photos={repPhotos} copiedUrl={copiedPhotoUrl} copyMode={photoCopyMode} onCopy={handleCopyPhoto} />
            </div>
          )}

          {/* 다녀온 장소 — 별점 아래에 그 장소 사진을 바로 둬서, 이 항목을 붙여넣은 자리에서 바로 사진도 이어붙일 수 있게 함 */}
          {placeReviewBlocks.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-slate-500">다녀온 장소</p>
                {placeReviewBlocks.length > 1 && (
                  <CopyTextButton text={allPlaceReviewsText} html={allPlaceReviewsHtml} label="전체 복사" />
                )}
              </div>
              <div className="space-y-3">
                {placeReviewBlocks.map(({ review: r, photos, text, html }) => (
                  <div key={r.placeId} className="rounded-xl border border-slate-200 p-2.5 dark:border-slate-700">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-200">
                        <span className="font-semibold">{r.placeName}</span> ⭐{r.rating.toFixed(1)}
                        <br />
                        {r.content}
                      </p>
                      <CopyTextButton text={text} html={html} label="글+사진 복사" />
                    </div>
                    {photos.length > 0 && (
                      <div className="mt-2">
                        <PhotoRow photos={photos} copiedUrl={copiedPhotoUrl} copyMode={photoCopyMode} onCopy={handleCopyPhoto} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 해시태그 */}
          {hashtags.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-slate-500">해시태그</p>
                <CopyTextButton text={hashtagsText} />
              </div>
              <p className="text-[12.5px] text-indigo-500">{hashtagsText}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              onClick={handleCopy}
              className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-slate-900 text-[13px] font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            >
              <Copy size={15} /> {copied ? "복사됐어요!" : "전체 한번에 복사"}
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
          <p className="text-[11px] leading-relaxed text-slate-400">
            티스토리는 자동 등록 기능이 막혀 있어(2024년 API 종료) 복사한 텍스트를 직접 붙여넣어야 해요. 네이버는
            제목·링크까지만 채워지니, 본문은 위 섹션을 순서대로 복사해 붙여넣어 완성해주세요.
          </p>
        </div>
      </div>
    </div>
  );
}
