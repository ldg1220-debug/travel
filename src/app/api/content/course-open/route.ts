import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { pool } from "@/lib/server/db";
import { COURSE_ALGO_VERSION, courseBuilderUrlFor, getCourseBrief, parseDays, resolveScope, type CourseBriefSpot } from "@/lib/server/courseBrief";
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
 * (region, days, 알고리즘 버전) 조합당 itineraries 행 하나로 멱등하다 —
 * 작업지시서 2026-09-06 "승격 후 실측" §2: 처음엔 호출마다 새 행을
 * 만들었는데, 이 라우트가 인증 없는 GET이라 크롤러·새로고침·SNS
 * 미리보기 봇이 그대로 새 레코드 증식 경로가 됐다(194편 블로그에 CTA로
 * 걸리면 그 자체가 문제). "userId+contentKey" UNIQUE 제약(schema.sql)에
 * 대한 INSERT … ON CONFLICT DO UPDATE … RETURNING으로, 이미 있으면 그
 * shareToken을 그대로 돌려주고 새 행을 만들지 않는다. 그래서 클릭한
 * 사람은 shareToken을 아는 사람 누구나 보고 고칠 수 있는 기존
 * capability-URL 모델 그대로 "그 지역+일수의" 공용 사본을 보게 된다
 * (기존의 "클릭마다 자기만의 사본" 설계에서 "지역+일수당 하나의 공용
 * 사본"으로 바뀐 것 — 콘텐츠 CTA의 의도상 이쪽이 맞다).
 *
 * ⚠️ contentKey에 COURSE_ALGO_VERSION을 포함한다 — 작업지시서 2026-09-08
 * "블로그에서 넘어온 코스가 비어 있습니다" §2: 알고리즘이 바뀌어도
 * (course-brief 캐시는 briefCacheKey에 버전이 있어 자연히 무효화되지만)
 * 이미 저장된 itineraries 행은 계속 그대로 열렸다. 버전을 키에 넣으면
 * 알고리즘이 바뀔 때 새 조합으로 취급돼 새 행이 만들어진다 — 예전
 * shareToken은 그 시점 스냅샷 그대로 남는다(옛 URL이 깨지진 않지만,
 * 이후 이 라우트로 다시 들어오는 트래픽은 새 shareToken을 받는다).
 *
 * ⚠️ ON CONFLICT DO UPDATE가 placesData를 무조건 유지하지 않는다 —
 * 기존 행의 placesData가 비어 있으면(예: 이 버전 이전에 만들어진, 스팟
 * 0곳짜리 행이 하필 같은 키로 다시 걸린 경우) 방금 새로 만든 placesData로
 * 덮어쓴다. 지금은 스팟이 0곳이면 애초에 INSERT까지 가지 않지만(아래
 * "스팟이 하나도 없으면" 가드), 그 가드가 생기기 전에 만들어진 빈 행이
 * 남아 있으면 그 뒤로 알고리즘이 몇 번을 고쳐져도 영원히 재사용됐다
 * (실측: 경주 days=1 — course-brief는 스팟 4곳을 정상 반환하는데
 * course-open은 예전에 만들어진 빈 계획을 계속 돌려줌). 비어 있지
 * 않은 정상 행은 그대로 둔다(멱등성 유지 — 이미 스팟이 있으면 그
 * shareToken의 사본을 계속 같은 내용으로 보여준다).
 */

const CONTENT_OWNER_EMAIL = "content@tradule.co.kr";
const START_HOUR = 9; // 하루 일정 시작 시각 — courseRecommend.ts의 기존 관례(9시 시작)와 맞춤

export const dynamic = "force-dynamic";
export const maxDuration = 60; // course-brief와 동일(2026-09-06 §4-2로 60초 상향) — 캐시 미스 시 코스 생성부터 해야 할 수 있다.

/**
 * 스팟 배열을 날짜별로 나눈다 — course-brief 응답의 `day` 필드(courseRecommend
 * 계약, courseBrief.ts assembleDaySpots가 채움)를 그대로 쓴다.
 *
 * ⚠️ 예전엔 "이 계약엔 날짜 구분 필드가 없다"(2026-08-27 스펙 기준)는
 * 전제로 toNextMinutes(null이면 그 날짜의 마지막 스팟)를 거꾸로 읽어
 * 날짜 경계를 추론했는데, `day` 필드가 2026-09-06 "승격 후 실측" §3에서
 * 추가된 뒤로 이 주석과 구현이 낡은 채 남아 있었다 — 작업지시서
 * 2026-09-08 "블로그에서 넘어온 코스가 비어 있습니다" §3. day 필드를
 * 직접 쓰면 "이 스팟이 몇 일차인가"를 재추론할 필요가 아예 없다.
 */
export function splitByDay(spots: CourseBriefSpot[]): CourseBriefSpot[][] {
  const byDay = new Map<number, CourseBriefSpot[]>();
  for (const spot of spots) {
    if (!byDay.has(spot.day)) byDay.set(spot.day, []);
    byDay.get(spot.day)!.push(spot);
  }
  return [...byDay.keys()].sort((a, b) => a - b).map((day) => byDay.get(day)!);
}

/** 하루치 스팟을 09:00부터 순서대로 배치한 ItineraryItem[]로 변환한다. */
export function scheduleDay(spots: CourseBriefSpot[], date: string, idPrefix: string): ItineraryItem[] {
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

  // (region, days, 알고리즘 버전) 조합당 하나로 멱등 — 파일 상단 주석
  // 참고. contentKey는 courseBrief.ts의 briefCacheKey/candidateCacheKey와
  // 같은 정규화 관례(trim+lowercase)를 따르고, 그쪽과 마찬가지로
  // COURSE_ALGO_VERSION을 포함한다. shareToken은 매번 새로 만들지만,
  // 충돌 시(이미 있는 조합) UPDATE 절이 기존 placesData가 이미 채워져
  // 있으면 그걸 그대로 두고 shareToken도 건드리지 않으므로 RETURNING은
  // 그 경우 "최초 생성 시점의" shareToken을 돌려준다 — 같은 URL이 계속
  // 유지된다. 기존 행이 비어 있던 경우에만(파일 상단 주석 참고)
  // placesData/title/region을 이번 결과로 갱신한다 — shareToken은 그
  // 경우에도 기존 값을 유지한다(빈 화면을 보고 있던 그 URL이 그대로
  // 고쳐지는 게, 새 URL을 새로 발급하는 것보다 낫다).
  const contentKey = `${resolveScope(region)}:${region.trim().toLowerCase()}:${days}:v${COURSE_ALGO_VERSION}`;
  const shareToken = randomUUID();
  const title = `${region} 여행 코스`;
  const result = await pool.query<{ shareToken: string }>(
    `insert into itineraries ("userId", title, region, "placesData", "shareToken", "isDraft", "contentKey")
     values ($1, $2, $3, $4, $5, false, $6)
     on conflict ("contentKey") do update set
       title = case when jsonb_array_length(itineraries."placesData") = 0 then excluded.title else itineraries.title end,
       region = case when jsonb_array_length(itineraries."placesData") = 0 then excluded.region else itineraries.region end,
       "placesData" = case when jsonb_array_length(itineraries."placesData") = 0 then excluded."placesData" else itineraries."placesData" end,
       updated_at = now()
     returning "shareToken"`,
    [ownerId, title, regionValue, JSON.stringify(placesData), shareToken, contentKey],
  );

  return NextResponse.redirect(`https://www.tradule.co.kr/planner/${result.rows[0].shareToken}`, 302);
});
