"use client";

import { useMemo, useState } from "react";
import { X, Copy, ExternalLink, Download } from "lucide-react";
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

/**
 * "내보내기" — 티스토리는 2024년 Open API를 완전히 종료했고 네이버 블로그
 * 글쓰기 API는 사업자 심사가 필요해서, 둘 다 자동 발행 대신 서식을 갖춘
 * 텍스트를 복사해 직접 붙여넣는 방식으로 대신한다. 본인 글이 아니면 원작자
 * 출처 문구를 본문 앞에 자동으로 붙여 무단 재게시처럼 보이지 않게 한다.
 *
 * 사진은 텍스트에 URL로 끼워 넣어봐야 블로그 에디터가 자동으로 이미지로
 * 바꿔주지 않아서(에디터마다 붙여넣기 동작이 달라 신뢰할 수 없음) 텍스트에서
 * 아예 빼고, 대신 썸네일마다 다운로드 버튼을 둬서 저장 후 에디터에 직접
 * 첨부하도록 안내한다. 해시태그와 다녀온 장소 리뷰는 본문에 자동으로
 * 포함되지 않는 구조 데이터라 별도로 텍스트에 조립해 넣는다.
 */
export function ExportPostModal({ title, content, images, placeReviews, url, authorName, isOwner, onClose }: ExportPostModalProps) {
  const [copied, setCopied] = useState(false);

  const photos = useMemo<ExportPhoto[]>(
    () => [
      ...images.map((photoUrl, i) => ({ url: photoUrl, label: `대표 사진 ${i + 1}` })),
      ...placeReviews.flatMap((r) => r.images.map((photoUrl, i) => ({ url: photoUrl, label: `${r.placeName} 사진 ${i + 1}` }))),
    ],
    [images, placeReviews],
  );

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
    return `${title}\n\n${attribution}${content}${placeReviewsBlock}${hashtagsBlock}`;
  }, [title, content, placeReviews, hashtags, isOwner, authorName, url]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
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
            텍스트에는 본문·다녀온 장소 리뷰·해시태그가 포함돼요. 사진은 아래에서 따로 저장해주세요.
          </p>

          {photos.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[12px] font-semibold text-slate-500">
                사진 {photos.length}장 — 눌러서 저장 후 블로그 글쓰기 화면에 직접 첨부해주세요
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((photo, i) => (
                  <a
                    key={`${photo.url}-${i}`}
                    href={photo.url}
                    download
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${photo.label} 다운로드`}
                    className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- own blob proxy URL */}
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                      <Download size={16} />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={handleCopy}
              className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-slate-900 text-[13px] font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            >
              <Copy size={15} /> {copied ? "복사됐어요!" : "텍스트 복사하기"}
            </button>
            <button
              onClick={handleNaver}
              className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <ExternalLink size={15} /> 네이버 블로그 새 글로 열기
            </button>
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
