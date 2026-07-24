"use client";

import { useState } from "react";
import { X, Copy, ExternalLink } from "lucide-react";

interface ExportPostModalProps {
  title: string;
  content: string;
  images: string[];
  url: string;
  authorName: string | null;
  isOwner: boolean;
  onClose: () => void;
}

/**
 * "내보내기" — 티스토리는 2024년 Open API를 완전히 종료했고 네이버 블로그
 * 글쓰기 API는 사업자 심사가 필요해서, 둘 다 자동 발행 대신 서식을 갖춘
 * 텍스트를 복사해 직접 붙여넣는 방식으로 대신한다. 본인 글이 아니면 원작자
 * 출처 문구를 본문 앞에 자동으로 붙여 무단 재게시처럼 보이지 않게 한다.
 */
export function ExportPostModal({ title, content, images, url, authorName, isOwner, onClose }: ExportPostModalProps) {
  const [copied, setCopied] = useState(false);

  const attribution = isOwner
    ? ""
    : `이 글은 ${authorName ?? "여행자"}님이 트레쥴에 작성한 여행 후기를 바탕으로 재구성했습니다. 원문 보기: ${url}\n\n`;
  const exportText = `${title}\n\n${attribution}${content}${images.length > 0 ? `\n\n사진\n${images.join("\n")}` : ""}`;

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
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
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
