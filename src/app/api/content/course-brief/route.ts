import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { getCourseBrief } from "@/lib/server/courseBrief";

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
// + 여유분.
export const maxDuration = 30;

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const region = (request.nextUrl.searchParams.get("region") ?? "").trim().slice(0, 40);
  if (!region) return NextResponse.json({ error: "missing region" }, { status: 400 });
  const days: 1 | 2 = request.nextUrl.searchParams.get("days") === "2" ? 2 : 1;

  const brief = await getCourseBrief(region, days);
  return NextResponse.json(brief);
});
