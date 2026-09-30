import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { getCourseBrief, maxDaysForStyle, meetsResortBeachRequirement, minViableSpots, parseDays, TransientApiFailureError, UnsupportedRegionError } from "@/lib/server/courseBrief";
import { styleForRegion, suggestOverseasRegions } from "@/lib/discoverData";

/**
 * 트레쥴 콘텐츠 API — 블로그 자동 발행 파이프라인(AutoPipeline, 별도
 * 저장소) 연동용 읽기 전용 엔드포인트. 스펙은 AutoPipeline 쪽 지시서와
 * 동일한 계약이라 필드명·구조를 임의로 바꾸면 안 된다(작업지시서
 * 2026-08-27 "트레쥴 콘텐츠 API").
 *
 * 실제 조립 로직(courseRecommendV2 재사용, 카탈로그/라이브 평점 보강,
 * 캐시)은 src/lib/server/courseBrief.ts에 있다 — 하루 1회 워밍 크론
 * (/api/cron/warm-course-brief)도 같은 로직을 그대로 재사용해야 해서
 * 별도 모듈로 뺐다(작업지시서 2026-09-01 "PR #223 검증 결과 + 후속"
 * §3). 이 파일은 요청 파싱과 응답 변환만 한다.
 */

export const dynamic = "force-dynamic";
// Vercel 함수 기본 타임아웃(플랜에 따라 10~15초)보다 여유를 두면서도
// 무한정 매달리지 않도록 명시한다 — 코스 생성(LLM+DP, 우리가 직접
// 제어 못 함) + 평점 보강 예산(DEFAULT_ENRICH_BUDGET_MS, courseBrief.ts)
// + 여유분. 작업지시서 2026-09-06 "정정 및 실측" §4-2 — 해외 days=2가
// 30초로는 여전히 504가 나 60초로 올림.
export const maxDuration = 60;

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const region = (request.nextUrl.searchParams.get("region") ?? "").trim().slice(0, 40);
  if (!region) return NextResponse.json({ error: "missing region" }, { status: 400 });
  // 작업지시서 2026-09-06 "PR #231 검증" §3 — 3박4일 등 제목과 본문
  // 일수가 어긋나는 문제를 없애기 위해 days=3을 새로 허용한다. 지원하지
  // 않는 값은 조용히 깎지 않고 400으로 거절한다(같은 날짜 "승격 후
  // 실측" §7-5 — 승격 전 프로덕션이 days=3 요청을 조용히 1로 깎아
  // 응답한 게 뒤늦게 드러난 적이 있다).
  //
  // 작업지시서 2026-09-23 "자동 코스 일수 확장(도시형 5일·휴양형 7일)" §1·§6 —
  // parseDays는 형식(1~7 정수인지)만 본다. 스타일별 상한은 지역을 먼저
  // 별칭 해석해야 정확히 판단할 수 있어(styleForRegion 주석 참고) 여기서
  // 별도로 확인한다 — 허용 범위를 넘으면 조용히 깎지 않고 400과 함께
  // 그 지역에서 실제로 허용되는 범위를 알려준다.
  const days = parseDays(request.nextUrl.searchParams.get("days"));
  if (days == null) return NextResponse.json({ error: "days must be an integer from 1 to 7" }, { status: 400 });
  const style = styleForRegion(region);
  const maxDays = maxDaysForStyle(style);
  if (days > maxDays) {
    return NextResponse.json({ error: "days exceeds this region's style limit", style, maxDays }, { status: 400 });
  }

  console.log(`[courseBrief] route=course-brief region=${region} days=${days}`);
  let brief;
  try {
    brief = await getCourseBrief(region, days);
  } catch (err) {
    // 작업지시서 2026-09-14 "미지원 지역이 엉뚱한 동명 지역으로
    // 바뀝니다" §3 — 모르는 지역을 조용히 아무거나로 채워 돌려주지
    // 않고, AutoPipeline이 "지원 안 함"과 "일시적 실패"를 구분할 수
    // 있도록 명시적으로 거부한다.
    if (err instanceof UnsupportedRegionError) {
      // 작업지시서 2026-09-23 "한국인이 가장 많이 가는 나라 셋이
      // 0개입니다" §5 — "지원 안 함"만 알려주고 끝내는 대신, 실제로
      // 안정적으로 동작하는 대안을 같이 준다(기존 필드는 그대로 유지 —
      // AutoPipeline과의 계약이라 구조를 바꾸지 않고 추가만 한다).
      return NextResponse.json(
        { error: "unsupported_region", region: err.region, message: "지원하지 않는 지역입니다.", suggestions: suggestOverseasRegions() },
        { status: 404 },
      );
    }
    // 작업지시서 2026-09-27 "해외 코스 후보가 2개로 무너졌습니다" / "Places
    // API 비용 절감" A-6 — 고베 d2·교토 d1·오사카 d2가 전부 count=2로
    // 무너졌을 때 422("이 조합은 원래 지원 안 함")를 냈는데, 실제로는
    // Places 호출 실패로 얇아진 것일 수 있었다. 이번 생성 중 실제 API
    // 실패가 있었다고 확인된 경우에만 이 에러가 던져진다 — 422 대신
    // 503("잠시 후 재시도")으로 구분해, AutoPipeline이 "영구 미지원"과
    // "일시적 장애"를 다르게 처리할 수 있게 한다.
    if (err instanceof TransientApiFailureError) {
      return NextResponse.json(
        { error: "temporarily_unavailable", region: err.region, count: err.spotCount, message: "일시적으로 코스를 만들 수 없습니다. 잠시 후 다시 시도해주세요." },
        { status: 503 },
      );
    }
    throw err;
  }
  // §4 — 스팟이 너무 적으면 C-2 계약("스팟이 부족하면 글을 쓰지
  // 않는다")의 판단을 AutoPipeline에만 맡기지 않고 서버가 명시한다.
  // minViableSpots는 courseBrief.ts의 캐시 기록 여부 판단과 같은 기준
  // 함수다 — 이 응답이 실패로 보는 기준과 "캐시할 가치가 있다"는 기준이
  // 어긋나면 안 된다(작업지시서 2026-09-23 "#266 검증" §3). 고정값
  // 대신 스타일·일수별 기준을 쓴다(작업지시서 2026-09-23 "자동 코스
  // 일수 확장" §4) — 휴양형은 하루 스팟이 적은 게 정상이라 도시형
  // 기준을 그대로 쓰면 정상 결과까지 거절하게 된다.
  const threshold = minViableSpots(style, days);
  // 작업지시서 2026-09-29 "#277 검증: 세 가지는 됐고, 7일 코스에서
  // 해변이 사라졌습니다" §2 — 스팟 수가 충분해도 휴양형 코스에 해변이
  // 하나도 없으면 "휴양 코스로 성립하지 않는다"(지시서 원문)는 별도
  // 판정이다. isCacheableBrief(쓰기)·isFreshBriefPayload(읽기)와 같은
  // 기준(meetsResortBeachRequirement)을 여기서도 써야 어긋나지 않는다
  // (작업지시서 2026-09-28 §2② 원칙 — 페이지·API가 같은 기준을 쓸 것).
  if (brief.spots.length < threshold) {
    return NextResponse.json({ error: "insufficient_spots", count: brief.spots.length, threshold }, { status: 422 });
  }
  // 작업지시서 2026-09-29 "#280 검증" §2 — 스팟 수는 충분한데("count 6,
  // threshold 6") 해변 요건에서 거절되면 같은 "insufficient_spots"로
  // 응답해 AutoPipeline 로그가 원인을 오해하게 만들었다. 사유를 구분해
  // 알린다(count·threshold는 그대로 실어 "스팟은 충분하다"가 보이게).
  if (!meetsResortBeachRequirement(brief.spots, style)) {
    return NextResponse.json({ error: "no_beach", count: brief.spots.length, threshold, message: "휴양형 코스인데 해변 후보를 찾지 못했습니다." }, { status: 422 });
  }
  return NextResponse.json(brief);
});
