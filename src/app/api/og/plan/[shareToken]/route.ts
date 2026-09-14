import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { generatePlanMapImage } from "@/lib/server/planMapImage";
import type { ItineraryItem } from "@/lib/types";

/**
 * 공유 링크(/planner/{shareToken})의 og:image로 쓰는 지도 썸네일 —
 * 작업지시서 2026-09-15 "공유 품질 4건" §1: 카카오톡 공유 카드에
 * og:image가 없어 제목 한 줄만 뜨고 썸네일이 안 나왔다.
 *
 * course-brief의 /api/content/course-map과 같은 관례(캐시된 이미지
 * blob URL로 302 리다이렉트)를 따른다. `.png` 확장자가 붙은 요청
 * (og:image에 쓰는 형태, `{shareToken}.png`)과 안 붙은 요청 둘 다
 * 받는다 — 확장자는 크롤러/브라우저가 Content-Type을 짐작하는 데
 * 쓰이지만, 실제 응답은 302라 최종 Content-Type은 리다이렉트 대상이
 * 정한다.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) => {
  const raw = (await params).shareToken;
  const shareToken = raw.endsWith(".png") ? raw.slice(0, -4) : raw;
  if (!shareToken) {
    return NextResponse.json({ error: "missing shareToken" }, { status: 400 });
  }

  const result = await pool.query<{ placesData: ItineraryItem[] }>(
    `select "placesData" from itineraries where "shareToken" = $1`,
    [shareToken],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const items = result.rows[0].placesData;
  if (!Array.isArray(items) || items.length === 0) {
    // 장소가 하나도 없는 계획(빈 초안 등)은 지도를 만들 수 없다 — 정직하게
    // 404를 준다. <meta property="og:image">는 깨진 이미지로 보이는
    // 정도라 페이지 자체가 망가지진 않는다.
    return NextResponse.json({ error: "map not available for this plan yet" }, { status: 404 });
  }

  const imageUrl = await generatePlanMapImage(shareToken, items);
  if (!imageUrl) {
    return NextResponse.json({ error: "map not available for this plan yet" }, { status: 404 });
  }
  return NextResponse.redirect(imageUrl, 302);
});
