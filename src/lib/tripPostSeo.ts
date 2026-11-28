/**
 * 작업지시서 2026-11-28 "공개 후기 페이지 서버 본문 렌더 + canonical" — 공개 후기(/trip/{id})의
 * 서버 렌더·canonical·JSON-LD 에 쓰는 순수 로직(DB 의존 없음, 단위 테스트 대상).
 * 입력은 반드시 visibility='public' 확인을 마친 데이터여야 한다(postMetadata.ts 가 보장).
 */
import type { ItineraryItem } from "@/lib/types";

export const SITE_ORIGIN = "https://www.tradule.co.kr";

/** 서버 HTML 에 싣는 본문 최대 글자 수(전체 텍스트는 클라이언트가 붙은 뒤 보여준다). */
export const SSR_CONTENT_MAX = 1500;

export interface PublicTripPostArticle {
  id: number;
  title: string;
  content: string;
  images: string[];
  authorName: string;
  region: string | null;
  tripTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** 코스 스냅샷의 일자별 장소 이름(없으면 빈 배열) */
  days: { date: string; names: string[] }[];
}

export function tripPostCanonical(id: number): string {
  return `${SITE_ORIGIN}/trip/${id}`;
}

export function clipContent(text: string, max = SSR_CONTENT_MAX): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 스냅샷 항목을 날짜별 장소 이름으로 묶는다(입력 순서 유지). */
export function summarizeDays(items: ItineraryItem[] | null | undefined): { date: string; names: string[] }[] {
  if (!Array.isArray(items)) return [];
  const byDate = new Map<string, string[]>();
  for (const it of items) {
    if (!it || typeof it.name !== "string") continue;
    const list = byDate.get(it.date) ?? [];
    list.push(it.name);
    byDate.set(it.date, list);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, names]) => ({ date, names }));
}

/** Article JSON-LD — headline·날짜·이미지·작성자만. 평점·수치는 넣지 않는다. */
export function buildTripPostJsonLd(p: PublicTripPostArticle): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title.slice(0, 110),
    datePublished: p.createdAt.toISOString(),
    dateModified: p.updatedAt.toISOString(),
    mainEntityOfPage: tripPostCanonical(p.id),
    author: { "@type": "Person", name: p.authorName },
    ...(p.images[0] ? { image: [p.images[0]] } : {}),
  };
}

/** <script type="application/ld+json"> 안에 안전하게 넣기 위해 `<` 를 이스케이프한다. */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
