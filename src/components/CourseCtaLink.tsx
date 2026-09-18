"use client";

import { trackFeatureEvent } from "@/lib/trackFeatureEvent";

/**
 * "내 계획으로 담아가기" — /course/{지역}/{일수} 공개 페이지의 CTA.
 * course-open(GET /api/content/course-open)이 이미 로그인 없이 코스를
 * 계획으로 만들어 /planner/{shareToken}으로 리다이렉트해준다(콘텐츠
 * 계획, 시스템 계정 소유) — 거기서 뷰어 배너의 "내 계획으로 담아가기"가
 * 실제 로그인+복사를 맡으므로, 이 컴포넌트는 새 로직을 만들지 않고 그
 * 흐름의 입구 역할만 한다.
 *
 * 작업지시서 2026-09-18 "트레쥴이 구글에 7페이지만 올라가 있습니다" §7:
 * "코스 페이지 → 담아가기 전환율"을 보려면 클릭 자체가 남아야 한다 —
 * 완료 여부는 이어지는 화면의 plan_copy_click/plan_copy_completed가
 * 계속 추적하므로, 여기서는 "코스 페이지에서 CTA를 눌렀다"만 남긴다.
 * 평범한 <a>라 클릭 핸들러가 없어도 항상 정상 이동한다(추적 실패가
 * 이동을 막지 않는다).
 */
export function CourseCtaLink({ region, days, className, children }: { region: string; days: number; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={`/api/content/course-open?region=${encodeURIComponent(region)}&days=${days}`}
      onClick={() => trackFeatureEvent("course_page_cta_click", "course", { region, days })}
      className={className}
    >
      {children}
    </a>
  );
}
