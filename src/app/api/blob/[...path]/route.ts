import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

/**
 * Serves a private Vercel Blob (an uploaded review/trip-post photo) through
 * our own server. This project's Blob store is configured for private
 * access, so the raw `*.blob.vercel-storage.com` URL 401s for a browser —
 * every reader has to go through a route that fetches it server-side
 * (where our Vercel credentials are available) instead. `/api/upload`
 * returns URLs pointing here rather than the raw Blob URL.
 *
 * No auth gate of its own — a pathname is an unguessable, per-upload
 * timestamped string, the same "long opaque URL" security model the old
 * public Blob URLs had, and these photos back reviews/trip posts that are
 * meant to be viewable by anyone with the link once published.
 */
/**
 * 과거 코스 지도 경로 `course-maps/{scope}/{region}/{days}/v{N}.png` · `…/{days}/d{n}/v{N}.png` — 발행된 블로그 글이 가리킨다.
 * 작업지시서 2026-10-13 "긴급: Vercel Blob 한도 초과" §3③: Blob 에서 못 읽으면(한도 차단·삭제·없음) 같은 region/days/day 의
 * course-map URL(Blob 없이 만드는 CDN 캐시 지도)로 302 — 블로그 HTML 을 고치지 않아도 지도가 보인다.
 */
const PHOTO_UNAVAILABLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f1f5f9"/><text x="200" y="150" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="16" fill="#64748b">사진을 잠시 불러올 수 없어요</text></svg>`;

export function legacyCourseMapRedirect(pathname: string): string | null {
  const m = /^course-maps\/[^/]+\/([^/]+)\/(\d+)\/(?:d(\d+)\/)?v\d+\.png$/.exec(pathname);
  if (!m) return null;
  let region = m[1];
  try {
    region = decodeURIComponent(region);
  } catch {
    // 이미 디코딩된 값이면 그대로 쓴다
  }
  return `/api/content/course-map?region=${encodeURIComponent(region)}&days=${m[2]}${m[3] ? `&day=${m[3]}` : ""}`;
}

/**
 * 과거 계획 지도 경로 `plan-maps/{shareToken}/{updatedAtMs}.png` → 해당 og 라우트(Blob 없이 CDN). 작업지시서 2026-10-13 "#314 검증" §2②.
 */
export function legacyPlanMapRedirect(pathname: string): string | null {
  const m = /^plan-maps\/([^/]+)\/(\d+)\.png$/.exec(pathname);
  return m ? `/api/og/plan/${encodeURIComponent(m[1])}.png?v=${m[2]}` : null;
}

export const GET = withApiErrorHandling(async (request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => {
  const { path } = await params;
  const pathname = path.join("/");

  // 작업지시서 2026-10-13 "#314 검증" §2② — 코스·계획 지도는 이제 Blob 에 새로 쓰이지 않는다. Blob 을 읽으려 하지 않고 곧바로 302 한다
  // (정지 중 매 요청 Blob 실패 왕복 제거 · 정지 해제 후에도 Blob 전송량/Simple op 0). 경로가 버전/시각 고정이라 바뀌지 않으므로 CDN 이 길게 캐시한다.
  const legacyRedirect = legacyCourseMapRedirect(pathname) ?? legacyPlanMapRedirect(pathname);
  if (legacyRedirect) {
    return NextResponse.redirect(new URL(legacyRedirect, request.url), { status: 302, headers: { "cache-control": "public, s-maxage=2592000" } });
  }

  let result: Awaited<ReturnType<typeof get>> = null;
  try {
    result = await get(pathname, { access: "private" });
  } catch (err) {
    console.error(`[blob] read failed for ${pathname}:`, err instanceof Error ? err.message : err);
    // 작업지시서 2026-10-13 "긴급: Vercel Blob 한도 초과" §3④ — 후기 사진은 깨진 이미지 대신 "잠시 불러올 수 없어요" 플레이스홀더(캐시하지 않는다).
    return new NextResponse(PHOTO_UNAVAILABLE_SVG, { status: 200, headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
  }
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "content-type": result.blob.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
});
