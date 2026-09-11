import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { fetchLegRoute, mapWithConcurrency, type LegRouteResult } from "@/lib/server/courseBrief";

/**
 * 계획 탭 지도·일정 시각용 실제 경로 조회 — 작업지시서 2026-09-11 "계획
 * 탭 동선을 실제 경로로" §3: "fetchKakaoDrivingRoute / fetchGoogleDirectionsRoute가
 * 이미 있습니다. 새로 만들지 말고 엔드포인트로 노출하세요." 실제 조회
 * 로직은 전부 courseBrief.ts의 fetchLegRoute에 있고, 이 파일은 요청
 * 파싱·검증과 응답 변환만 한다(course-brief/route.ts와 같은 패턴).
 *
 * 계획 탭은 로그인 없이도 쓸 수 있는 화면이라(PlannerBoard가 세션을
 * 필수로 요구하지 않음) 이 엔드포인트도 인증을 요구하지 않는다 — 대신
 * IP당 요청 빈도를 제한해 남용(유료 Kakao/Google API 호출 낭비)을 막는다.
 */
export const dynamic = "force-dynamic";

export interface RouteLegBody {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}

const MAX_LEGS_PER_REQUEST = 40;
// 한 요청 안에서 동시에 몇 개 구간을 병렬로 조회할지 — courseBrief.ts의
// 다른 외부 호출 팬아웃(liveEnrichSpots 등)과 같은 이유로 무제한 동시
// 호출 대신 상한을 둔다(Kakao/Google 쪽 순간 부하·타임아웃 관리).
const LEG_FETCH_CONCURRENCY = 4;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** 요청 바디를 검증된 leg 목록으로 바꾼다 — 순수 함수라 네트워크 없이 단위 테스트할 수 있다. 문제가 있으면 사용자에게 보여줄 짧은 이유 문자열을 돌려준다. */
export function parseLegsBody(body: unknown): { legs: RouteLegBody[] } | { error: string } {
  if (typeof body !== "object" || body === null || !Array.isArray((body as { legs?: unknown }).legs)) {
    return { error: "legs must be an array" };
  }
  const rawLegs = (body as { legs: unknown[] }).legs;
  if (rawLegs.length === 0) return { legs: [] };
  if (rawLegs.length > MAX_LEGS_PER_REQUEST) return { error: `legs must have at most ${MAX_LEGS_PER_REQUEST} entries` };

  const legs: RouteLegBody[] = [];
  for (const raw of rawLegs) {
    if (typeof raw !== "object" || raw === null) return { error: "each leg must be an object" };
    const { fromLat, fromLng, toLat, toLng } = raw as Record<string, unknown>;
    if (![fromLat, fromLng, toLat, toLng].every(isFiniteNumber)) {
      return { error: "each leg needs numeric fromLat/fromLng/toLat/toLng" };
    }
    legs.push({ fromLat: fromLat as number, fromLng: fromLng as number, toLat: toLat as number, toLng: toLng as number });
  }
  return { legs };
}

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // 드래그 한 번에도 여러 구간이 한 요청에 묶여 오지만(디바운스 — 클라
  // 이언트 쪽 규칙), 짧은 시간에 여러 번의 드래그·재조회가 몰릴 수 있어
  // IP당 넉넉한 분당 한도를 둔다.
  if (!(await checkRateLimit(`routes:${ip}`, 60, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const parsed = parseLegsBody(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const results: LegRouteResult[] = await mapWithConcurrency(parsed.legs, LEG_FETCH_CONCURRENCY, (leg) =>
    fetchLegRoute({ lat: leg.fromLat, lng: leg.fromLng }, { lat: leg.toLat, lng: leg.toLng }),
  );

  return NextResponse.json(
    results.map((r) => ({ distanceM: r.distanceM, durationMin: r.durationMin, path: r.path })),
  );
});
