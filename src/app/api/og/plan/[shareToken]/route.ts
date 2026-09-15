import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { generatePlanMapImage } from "@/lib/server/planMapImage";
import type { ItineraryItem } from "@/lib/types";

/**
 * 공유 링크(/planner/{shareToken})의 og:image로 쓰는 지도 썸네일 —
 * 작업지시서 2026-09-15 "공유 품질 4건" §1, 이어서 "og:image가
 * 404입니다" §2.
 *
 * ★★★ 이 응답은 실패해도 404를 주지 않는다 — 크롤러(카카오톡 등)가
 * og:image를 한 번 404로 확인하면 그 상태를 캐시해, 나중에 고쳐도
 * 카드가 안 바뀐다(§2 "없는 것보다 나쁠 수 있다 — 크롤러가 깨진
 * 이미지를 기억한다"). 지도를 못 만드는 모든 경우(계획 없음, 장소
 * 없음, API 키 미설정, Google Static Maps 실패 등) 전부 사이트 기본
 * og 이미지(/opengraph-image, 앱 루트의 next/og 이미지)로 302
 * 리다이렉트한다 — "실패해도 200이어야 한다"는 요구를, 실제로는 302 뒤에
 * 진짜 이미지가 오는 방식으로 만족한다(과거 course-map/route.ts가
 * 성공 시에도 이미 이 방식 — Blob URL로 302 — 이라 크롤러가 못 따라갈
 * 걱정은 없다).
 *
 * course-brief의 /api/content/course-map과 같은 관례를 따른다. `.png`
 * 확장자가 붙은 요청(og:image에 쓰는 형태, `{shareToken}.png`)과 안
 * 붙은 요청 둘 다 받는다.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_OG_IMAGE = "https://www.tradule.co.kr/opengraph-image";

export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) => {
  const raw = (await params).shareToken;
  const shareToken = raw.endsWith(".png") ? raw.slice(0, -4) : raw;
  if (!shareToken) {
    return NextResponse.redirect(DEFAULT_OG_IMAGE, 302);
  }

  const result = await pool.query<{ placesData: ItineraryItem[]; updated_at: string }>(
    `select "placesData", updated_at from itineraries where "shareToken" = $1`,
    [shareToken],
  );
  const row = result.rows[0];
  const items = row?.placesData;
  if (!row || !Array.isArray(items) || items.length === 0) {
    return NextResponse.redirect(DEFAULT_OG_IMAGE, 302);
  }

  const imageUrl = await generatePlanMapImage(shareToken, items, new Date(row.updated_at).getTime());
  return NextResponse.redirect(imageUrl ?? DEFAULT_OG_IMAGE, 302);
});
