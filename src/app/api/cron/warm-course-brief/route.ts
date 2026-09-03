import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { getCourseBrief, mapWithConcurrency, pickStaleRegions } from "@/lib/server/courseBrief";
import { allSpots, DOMESTIC_CITY_SEEDS } from "@/lib/discoverData";

/**
 * Vercel Cron(vercel.json, 하루 1회) — 블로그 파이프라인이 실제로 쓸
 * 지역들의 course-brief 응답을 미리 만들어 캐시를 채워둔다.
 *
 * 작업지시서 2026-09-02 "워밍 재설계" §A: 이전 설계(전체 58개 지역을
 * 지역당 30초 예산으로 한 번에 순회)는 최대 29분이 걸릴 수 있어 Vercel
 * 서버리스 함수 시간 안에 절대 완주할 수 없었다 — 실측(Run 버튼 수동
 * 실행)으로도 캐시가 전혀 안 쌓였다. "완주 실패 → 아무것도 안 남음"
 * 구조라 예산을 아무리 조정해도 근본적으로 고쳐지지 않는 문제였다.
 *
 * 대신 매 실행마다 작은 배치(BATCH_SIZE)만 처리해 반드시 완주하는
 * 쪽으로 바꿨다: 캐시가 없거나 가장 오래된 지역부터 순서대로 채운다
 * (pickStaleRegions). 하루 1회, 배치 5개면 12일에 전체 58곳을 한
 * 바퀴 돈다 — 블로그가 주 3편 발행하는 속도에는 충분하다(지시서
 * §A-3). 필요하면 Vercel Cron Jobs 화면의 Run 버튼으로 수동으로도
 * 여러 번 돌려 더 빨리 채울 수 있다(매번 다른 배치를 고르므로).
 *
 * 대상 지역은 새로 지어낸 목록이 아니라 discoverData.ts에 이미 있는
 * 카탈로그의 부산물이다 — 국내는 DOMESTIC_CITY_SEEDS의 "시도 · 동네"가
 * 아닌 단독 지역명(예: "안동", "통영")만(course-brief의 region은 이
 * 형태를 기대), 해외는 allSpots("overseas")에 실제로 등장하는 도시
 * 이름들. 경주는 실명 데이터가 이미 풍부해 DOMESTIC_CITY_SEEDS에서는
 * 빠져 있어 따로 추가했다.
 */

export const dynamic = "force-dynamic";
// 배치가 작아(5개, 동시성 3) 정상적인 경우 20초 안팎에 끝난다 — 다만
// 코스 생성(LLM+DP, 우리가 직접 제어 못 함) 자체가 가끔 느릴 수 있어
// 여유를 크게 둔다. 이전 설계의 300초와 달리 이번엔 여유가 아니라
// 안전망 — 정상 실행이라면 이 값에 근접할 일이 없어야 한다.
export const maxDuration = 90;

const BATCH_SIZE = 5; // 지시서 §A-3 권장값 — 하루 1회 × 12일이면 전체 58곳 순회
const PER_REGION_ENRICH_BUDGET_MS = 8000; // 지시서 §A-3 권장값
const WARM_CONCURRENCY = 3; // 지시서 §A-3 권장값

const DOMESTIC_WARM_REGIONS: string[] = ["경주", ...DOMESTIC_CITY_SEEDS.filter(([region]) => !region.includes(" · ")).map(([region]) => region)];

const OVERSEAS_WARM_REGIONS: string[] = (() => {
  const cities = new Set<string>();
  for (const spot of allSpots("overseas")) {
    const city = spot.region.split(" · ")[1];
    if (city) cities.add(city);
  }
  return [...cities];
})();

const WARM_REGIONS: string[] = [...DOMESTIC_WARM_REGIONS, ...OVERSEAS_WARM_REGIONS];

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET이 설정되지 않았어요" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batch = await pickStaleRegions(WARM_REGIONS, BATCH_SIZE);

  const warmed = await mapWithConcurrency(batch, WARM_CONCURRENCY, async (region) => {
    try {
      const brief = await getCourseBrief(region, 1, PER_REGION_ENRICH_BUDGET_MS);
      return { region, ok: true as const, spots: brief.spots.length, rated: brief.spots.filter((s) => s.rating != null).length };
    } catch (err) {
      console.error(`[warm-course-brief] ${region} 실패:`, err);
      return { region, ok: false as const };
    }
  });

  return NextResponse.json({ ok: true, totalRegions: WARM_REGIONS.length, batchSize: batch.length, warmed });
});
