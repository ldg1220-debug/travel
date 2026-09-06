import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { pool } from "@/lib/server/db";
import { courseBuilderUrlFor, getCourseBrief, parseDays, resolveScope, type CourseBriefSpot } from "@/lib/server/courseBrief";
import { DEFAULT_DURATION_MINUTES, formatTime, shiftISODate, todayISODate } from "@/lib/timeline";
import type { ItineraryItem, Region } from "@/lib/types";

/**
 * 블로그 CTA("이 코스 그대로 가져가기") 진입점. 작업지시서 2026-09-05
 * "AutoPipeline 통합" §D-3/§B-2 — course-brief가 만든 코스를 실제
 * 트레쥴 계획(itineraries 행)으로 저장하고, 이미 있는 공유 페이지
 * (/planner/{shareToken})로 바로 들여보낸다. 새 페이지·새 공유 방식을
 * 만들지 않는다 — 사용자 확인(2026-09-06, "시스템 계정 + 기존 공유
 * URL")에 따른 선택이다.
 *
 * itineraries."userId"는 NOT NULL FK라 소유자가 있어야 하는데, 이건
 * 로그인한 사람이 아니라 콘텐츠 파이프라인이 만든 계획이다. 그래서
 * schema.sql에 심어둔 고정 시스템 계정(CONTENT_OWNER_EMAIL)이 소유자
 * 역할만 한다 — 로그인은 못 하는 계정이고(연결된 OAuth 계정 없음),
 * FK를 만족시키는 표식일 뿐이다.
 *
 * (region, days) 조합당 itineraries 행 하나로 멱등하다 — 작업지시서
 * 2026-09-06 "승격 후 실측" §2: 처음엔 호출마다 새 행을 만들었는데,
 * 이 라우트가 인증 없는 GET이라 크롤러·새로고침·SNS 미리보기 봇이
 * 그대로 새 레코드 증식 경로가 됐다(194편 블로그에 CTA로 걸리면 그
 * 자체가 문제). "userId+contentKey" UNIQUE 제약(schema.sql)에 대한
 * INSERT … ON CONFLICT DO UPDATE … RETURNING으로, 이미 있으면 그
 * shareToken을 그대로 돌려주고 새 행을 만들지 않는다. 그래서 클릭한
 * 사람은 shareToken을 아는 사람 누구나 보고 고칠 수 있는 기존
 * capability-URL 모델 그대로 "그 지역+일수의" 공용 사본을 보게 된다
 * (기존의 "클릭마다 자기만의 사본" 설계에서 "지역+일수당 하나의 공용
 * 사본"으로 바뀐 것 — 콘텐츠 CTA의 의도상 이쪽이 맞다).
 */

const CONTENT_OWNER_EMAIL = "content@tradule.co.kr";
const START_HOUR = 9; // 하루 일정 시작 시각 — courseRecommend.ts의 기존 관례(9시 시작)와 맞춤

export const dynamic = "force-dynamic";
export const maxDuration = 60; // course-brief와 동일(2026-09-06 §4-2로 60초 상향) — 캐시 미스 시 코스 생성부터 해야 할 수 있다.

/**
 * 스팟 배열을 날짜별로 나눈다 — course-brief 계약엔 날짜 구분 필드가
 * 없지만(2026-08-27 스펙, 고정 계약이라 새로 추가하지 않음), 날짜가
 * 바뀌는 경계는 이미 toNextMinutes: null로 표시돼 있다(courseBrief.ts
 * assembleDaySpots 참고) — 그 표시를 그대로 날짜 분리에 재사용한다.
 */
function splitByDay(spots: CourseBriefSpot[]): CourseBriefSpot[][] {
  const days: CourseBriefSpot[][] = [];
  let current: CourseBriefSpot[] = [];
  spots.forEach((spot, i) => {
    current.push(spot);
    const isLast = i === spots.length - 1;
    if (spot.toNextMinutes == null && !isLast) {
      days.push(current);
      current = [];
    }
  });
  if (current.length > 0) days.push(current);
  return days;
}

/** 하루치 스팟을 09:00부터 순서대로 배치한 ItineraryItem[]로 변환한다. */
function scheduleDay(spots: CourseBriefSpot[], date: string, idPrefix: string): ItineraryItem[] {
  let clock = START_HOUR * 60;
  return spots.map((spot, i) => {
    const hour = Math.floor(clock / 60) % 24;
    const minute = clock % 60;
    const item: ItineraryItem = {
      // Google/Kakao placeId가 아니라 이 계획 안에서만 쓰는 합성 id다 —
      // course-brief 공개 계약엔 실제 placeId가 없다(스팟 목록·평점·좌표
      // 등만 준다). PlannerBoard는 로컬 places 카탈로그에 없는 placeId를
      // 만나면 item.coordinates로 마커를 다시 합성하므로(PlannerBoard.tsx
      // "A viewer's local `places` catalog may not have every place…" 참고)
      // 실제 Google placeId가 아니어도 지도·타임라인 모두 정상 동작한다.
      id: `${idPrefix}-${i}`,
      placeId: `${idPrefix}-${i}`,
      name: spot.name,
      date,
      time: formatTime(hour, minute),
      durationMinutes: DEFAULT_DURATION_MINUTES,
      coordinates: { lat: spot.lat, lng: spot.lng },
    };
    clock += DEFAULT_DURATION_MINUTES + (spot.toNextMinutes ?? 0);
    return item;
  });
}

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const region = (request.nextUrl.searchParams.get("region") ?? "").trim().slice(0, 40);
  if (!region) return NextResponse.json({ error: "missing region" }, { status: 400 });
  const days = parseDays(request.nextUrl.searchParams.get("days"));
  if (days == null) return NextResponse.json({ error: "days must be 1, 2, or 3" }, { status: 400 });

  const brief = await getCourseBrief(region, days);
  if (brief.spots.length === 0) {
    // 스팟이 하나도 없으면 계획을 만들 수 없다 — 코스 만들기 화면으로
    // 보내 직접 시작하게 한다(빈 계획을 만들어 혼란을 주는 것보다 낫다).
    // brief.appUrl은 이제 이 라우트 자신을 가리키므로(courseBrief.ts
    // appUrlFor 참고) 여기로 리다이렉트하면 무한 루프가 된다 — 별도
    // 목적지(courseBuilderUrlFor)를 쓴다.
    return NextResponse.redirect(courseBuilderUrlFor(region), 302);
  }

  const owner = await pool.query<{ id: number }>(`select id from users where email = $1`, [CONTENT_OWNER_EMAIL]);
  if (owner.rowCount === 0) {
    // schema.sql의 시스템 계정 시드가 아직 반영 안 된 배포(마이그레이션
    // 실행 전)이거나 계정이 지워진 상태 — 가짜 소유자로 우회하지 않고
    // 정직하게 실패시킨다.
    console.error("[content/course-open] system owner user not found — has the schema migration run?");
    return NextResponse.json({ error: "course import is not configured yet" }, { status: 503 });
  }
  const ownerId = owner.rows[0].id;

  const dayGroups = splitByDay(brief.spots);
  const startDate = todayISODate();
  const placesData: ItineraryItem[] = dayGroups.flatMap((dayStops, dayIndex) =>
    scheduleDay(dayStops, shiftISODate(startDate, dayIndex), `content-${dayIndex}`),
  );

  const regionValue: Region = resolveScope(region) === "overseas" ? "international" : "domestic";

  // (region, days) 조합당 하나로 멱등 — 파일 상단 주석 참고. contentKey는
  // courseBrief.ts의 briefCacheKey/candidateCacheKey와 같은 정규화
  // 관례(trim+lowercase)를 따른다. shareToken은 매번 새로 만들지만,
  // 충돌 시(이미 있는 조합) UPDATE 절이 shareToken/placesData를 건드리지
  // 않으므로 RETURNING은 항상 "최초 생성 시점의" shareToken을 돌려준다
  // — 같은 URL이 계속 유지된다.
  const contentKey = `${resolveScope(region)}:${region.trim().toLowerCase()}:${days}`;
  const shareToken = randomUUID();
  const result = await pool.query<{ shareToken: string }>(
    `insert into itineraries ("userId", title, region, "placesData", "shareToken", "isDraft", "contentKey")
     values ($1, $2, $3, $4, $5, false, $6)
     on conflict ("contentKey") do update set updated_at = now()
     returning "shareToken"`,
    [ownerId, `${region} 여행 코스`, regionValue, JSON.stringify(placesData), shareToken, contentKey],
  );

  return NextResponse.redirect(`https://www.tradule.co.kr/planner/${result.rows[0].shareToken}`, 302);
});
