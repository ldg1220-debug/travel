import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { getCourseBrief, mapWithConcurrency, pickStaleTasks, type WarmTask } from "@/lib/server/courseBrief";
import { flatRegions } from "@/lib/discoverData";
import { ENABLED_COURSE_PAGES } from "@/lib/coursePages";

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

// 작업지시서 2026-09-23 "코스 페이지가 열립니다 + 남은 4건" §2 —
// pickStaleTasks가 WARM_TASKS 전체(수백 개)를 하나의 풀로 놓고 가장
// 오래된 BATCH_SIZE(12)개만 뽑다 보니, sitemap에 올라가는 24개
// (ENABLED_COURSE_PAGES)도 그 큰 풀 안에서 순번을 기다려야 했다 —
// 한 번 워밍된 뒤 다시 그 24개 차례가 오기까지 전체 태스크 수에 비례한
// 날짜가 걸려 TTL(26시간) 안에 못 돌아올 수 있었다. sitemap 우선순위
// 태스크는 별도 풀로 떼어 매 실행마다 고정된 몫(PRIORITY_BATCH_SIZE)을
// 먼저 배정하고, 남는 자리만 나머지 태스크에 준다 — 전체 BATCH_SIZE는
// 그대로라 실행 시간 예산(90초)에 새 위험을 더하지 않는다.
//
// 지시서는 크론 주기도 TTL보다 짧게(6시간마다) 줄이라고 했으나, 그
// 설정(vercel.json "0 */6 * * *")은 PR #270 배포에서 Vercel이 거부했다 —
// "Hobby accounts are limited to daily cron jobs." 이 프로젝트는 Hobby
// 플랜이라 하루 1회보다 잦은 크론을 못 쓴다(vercel.json은 하루 1회로
// 되돌렸다). 그래서 이 우선순위 분리만으로는 24개 전부가 항상 TTL 안에
// 갱신된다고 보장하지 못한다 — 하루 1회·회당 PRIORITY_BATCH_SIZE(8)개면
// 24개를 한 바퀴 채우는 데 최대 3일이 걸린다. 그래도 이전(태스크 수백
// 개와 무순위 경쟁)보다는 훨씬 낫다. 완전히 해결하려면 Pro 플랜으로
// 크론을 늘리거나, BATCH_SIZE/maxDuration을 함께 올려야 하는데 후자는
// 실제 실행 시간 실측 없이는 위험하다(90초 예산을 넘기면 배치 전체가
// 실패할 수 있다 — 위 BATCH_SIZE 주석 참고).
const PRIORITY_BATCH_SIZE = 8;

const PRIORITY_TASKS: WarmTask[] = ENABLED_COURSE_PAGES.map(({ region, days }): WarmTask => ({ region, days }));

const WARM_TASKS: WarmTask[] = [
  ...flatRegions("domestic").map((r): WarmTask => ({ region: r.name, days: 1 })),
  ...flatRegions("overseas").map((r): WarmTask => ({ region: r.name, days: 2 })),
  ...flatRegions("overseas").map((r): WarmTask => ({ region: r.name, days: 3 })),
  // 작업지시서 2026-09-18 "트레쥴이 구글에 7페이지만 올라가 있습니다" §4/§6:
  // /course/{지역}/{일수} 공개 페이지(coursePages.ts 1단계 허용목록)는
  // getCourseBrief(캐시 미스 시 라이브 생성 폴백 있음)를 쓰지만, 그래도
  // 여기서 미리 채워둬야 첫 방문자·크롤러가 콜드 캐시로 라이브 생성
  // (LLM+DP, 최대 수십 초)을 그대로 기다리지 않는다. (region, days) 쌍
  // 그대로 워밍한다 — 서울·부산·제주·인천(§3, days=2)이 기존 20곳
  // (days=3)과 다른 일수라 곱집합으로 되돌리면 안 된다.
  ...PRIORITY_TASKS,
];

// 위 우선순위 풀과 겹치는 태스크를 일반 풀에서 뺀다 — 같은 (region,
// days)가 두 풀 모두에서 뽑혀 한 배치 안에서 두 번 워밍되는 낭비를 막는다.
const GENERAL_TASKS: WarmTask[] = WARM_TASKS.filter((t) => !PRIORITY_TASKS.some((p) => p.region === t.region && p.days === t.days));

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET이 설정되지 않았어요" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const priorityBatch = await pickStaleTasks(PRIORITY_TASKS, PRIORITY_BATCH_SIZE);
  const generalBatch = await pickStaleTasks(GENERAL_TASKS, BATCH_SIZE - priorityBatch.length);
  const batch = [...priorityBatch, ...generalBatch];

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
