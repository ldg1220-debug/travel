import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { getCourseBrief } from "@/lib/server/courseBrief";
import { allSpots, DOMESTIC_CITY_SEEDS } from "@/lib/discoverData";

/**
 * Vercel Cron(vercel.json, 하루 1회) — 블로그 파이프라인이 실제로 쓸
 * 지역들의 course-brief 응답을 미리 만들어 캐시를 채워둔다.
 *
 * 작업지시서 2026-09-01 "PR #223 검증 결과 + 후속" §3: 사용자 요청 경로는
 * 무응답을 막으려고 평점 보강에 6초 예산을 두는데, 그러면 안동처럼
 * 카탈로그에 없는 지역은 평점 확보율이 낮게(1/5) 나온다. 크론은 사용자
 * 대기가 없으므로 지역당 예산을 훨씬 넉넉히 잡아(30초) 최대한 채운
 * 뒤 캐시에 남겨두면, 실제 요청은 그 캐시를 그대로 히트한다.
 *
 * 대상 지역은 새로 지어낸 목록이 아니라 discoverData.ts에 이미 있는
 * 카탈로그의 부산물이다 — 국내는 DOMESTIC_CITY_SEEDS의 "시도 · 동네"가
 * 아닌 단독 지역명(예: "안동", "통영")만(course-brief의 region은 이
 * 형태를 기대), 해외는 allSpots("overseas")에 실제로 등장하는 도시
 * 이름들. 경주는 실명 데이터가 이미 풍부해 DOMESTIC_CITY_SEEDS에서는
 * 빠져 있어 따로 추가했다.
 */

export const dynamic = "force-dynamic";
// 지역 수가 많아(국내 30여 + 해외 20곳 안팎) 전부 콜드 스타트로 처리하면
// 수십 분이 걸릴 수 있다 — 아래 CRON_BUDGET_MS로 한 번의 실행 시간
// 자체를 자른다. 300은 Vercel의 일반적인 함수 실행 시간 상한 근처값이라
// 골랐다 — 배포된 플랜이 이보다 낮은 상한만 허용하면 Vercel이 조용히
// 그 값으로 낮춰 적용한다(에러는 아니다). 어느 쪽이든 이 크론은 "한
// 번에 얼마나 처리했는지"를 안에서 스스로 재는 구조라 상한이 낮아도
// 그만큼만 처리하고 끝난다 — 남은 지역은 다음날 크론이 이어서
// 채운다(이미 캐시된 지역은 즉시 스킵되므로 결국 전체가 수렴한다).
export const maxDuration = 300;

const CRON_BUDGET_MS = 280_000; // maxDuration보다 여유를 둬 마지막 지역 처리 + 응답 직렬화 시간을 남긴다
const PER_REGION_ENRICH_BUDGET_MS = 30_000; // 지시서 §3 예시값 — 사용자 대기가 없으므로 넉넉하게

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

  const deadline = Date.now() + CRON_BUDGET_MS;
  const warmed: { region: string; spots: number; rated: number }[] = [];
  const failed: string[] = [];
  let stoppedEarlyAt: string | null = null;

  for (const region of WARM_REGIONS) {
    if (Date.now() > deadline) {
      stoppedEarlyAt = region;
      break;
    }
    try {
      // getCourseBrief는 이미 캐시를 먼저 확인한다 — 아직 안 지난(26시간)
      // 지역이면 사실상 즉시 반환되고, 새로 만들 지역만 실제 시간을 쓴다.
      const brief = await getCourseBrief(region, 1, PER_REGION_ENRICH_BUDGET_MS);
      warmed.push({ region, spots: brief.spots.length, rated: brief.spots.filter((s) => s.rating != null).length });
    } catch (err) {
      console.error(`[warm-course-brief] ${region} 실패:`, err);
      failed.push(region);
    }
  }

  return NextResponse.json({
    ok: true,
    totalRegions: WARM_REGIONS.length,
    processed: warmed.length,
    failed,
    stoppedEarlyAt,
    warmed,
  });
});
