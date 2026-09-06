import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { getCourseBrief, mapWithConcurrency, pickStaleTasks, type WarmTask } from "@/lib/server/courseBrief";
import { flatRegions } from "@/lib/discoverData";

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
 * 쪽으로 바꿨다: 캐시가 없거나 가장 오래된 (지역, 일수) 조합부터
 * 순서대로 채운다(pickStaleTasks). 필요하면 Vercel Cron Jobs 화면의
 * Run 버튼으로 수동으로도 여러 번 돌려 더 빨리 채울 수 있다(매번 다른
 * 배치를 고르므로).
 *
 * 작업지시서 2026-09-06 "정정 및 실측" §4-4: 대상 지역을
 * /api/content/regions와 같은 소스(discoverData.ts의 flatRegions)로
 * 통일한다 — 이전엔 DOMESTIC_CITY_SEEDS/allSpots에서 뽑은 좁은
 * 목록(58곳)만 워밍했는데, AutoPipeline에 "쓸 수 있다"고 알려주는
 * regions API는 198곳을 돌려주고 있어 둘이 어긋나 있었다.
 *
 * 일수는 국내 1일 · 해외 2일·3일로 워밍한다 — AutoPipeline의 상식
 * 게이트(REGION_PROFILES)상 해외는 minDays>=2가 하드 규칙이라 해외 1일
 * 코스는 애초에 블로그에서 쓰이지 않는다. days=3은 작업지시서
 * 2026-09-06 "승격 후 실측" §7-4에서 실측(오사카 20.5초, skipLlm 적용
 * 후)으로 안전성이 확인된 뒤 추가했다.
 */

export const dynamic = "force-dynamic";
// 코스 생성(LLM+DP, 우리가 직접 제어 못 함) 자체가 가끔 느릴 수 있어
// 안전망으로 크게 잡아둔다. 정상 실행이라면 이 값에 근접할 일이 없어야
// 한다.
export const maxDuration = 90;

// 지시서 2026-09-06 §4-3이 BATCH_SIZE=20을 "실측(5개=20.39초) 기준 90초
// 예산 안에서 여유(약 70초)"라 봤지만, 그 실측은 days=2(당시 skipLlm
// 없이 day1·day2 모두 LLM 호출)였다 — 동시성 3에서 20개를 처리하면
// worst case(전부 cold) ceil(20/3)=7 그룹 × 지역당 최대 십수 초로
// 90초에 바짝 붙는다. 여기에 이번에 새로 추가하는 overseas days=3
// 태스크는 배포 직후 전부 캐시가 없어(pickStaleTasks가 "캐시 없음"을
// 가장 오래된 것으로 취급) 첫 며칠간 배치를 통째로 차지할 수 있다 —
// "배치가 완주 못 하면 아무것도 안 남는다"(작업지시서 2026-09-02
// "워밍 재설계")는 교훈을 다시 어기지 않도록 보수적으로 낮춘다.
const BATCH_SIZE = 12;
const PER_REGION_ENRICH_BUDGET_MS = 8000; // 지시서 §A-3 권장값
const WARM_CONCURRENCY = 3; // 지시서 §A-3 권장값

const WARM_TASKS: WarmTask[] = [
  ...flatRegions("domestic").map((r): WarmTask => ({ region: r.name, days: 1 })),
  ...flatRegions("overseas").map((r): WarmTask => ({ region: r.name, days: 2 })),
  ...flatRegions("overseas").map((r): WarmTask => ({ region: r.name, days: 3 })),
];

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET이 설정되지 않았어요" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batch = await pickStaleTasks(WARM_TASKS, BATCH_SIZE);

  const warmed = await mapWithConcurrency(batch, WARM_CONCURRENCY, async ({ region, days }) => {
    try {
      const brief = await getCourseBrief(region, days, PER_REGION_ENRICH_BUDGET_MS);
      return { region, days, ok: true as const, spots: brief.spots.length, rated: brief.spots.filter((s) => s.rating != null).length };
    } catch (err) {
      console.error(`[warm-course-brief] ${region}(${days}일) 실패:`, err);
      return { region, days, ok: false as const };
    }
  });

  // Vercel 로그 패널이 응답 본문을 보여주지 않아, 실행 결과를 로그로도
  // 남긴다 — 지시서 §5 "크론 응답에 요약 로그를 남기시면 다음부터
  // 확인이 쉬워집니다".
  console.log(
    `[warm-course-brief] ${warmed.length}건 처리:`,
    warmed.map((w) => `${w.region}(${w.days}일)${w.ok ? `✓ rated=${w.rated}/${w.spots}` : "✗"}`).join(", "),
  );

  return NextResponse.json({ ok: true, totalTasks: WARM_TASKS.length, batchSize: batch.length, warmed });
});
