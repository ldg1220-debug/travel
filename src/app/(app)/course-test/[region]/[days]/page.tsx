import { getCourseBrief } from "@/lib/server/courseBrief";

/**
 * 임시 진단 라우트 — 작업지시서 2026-09-23 "#266 검증: 둘은 됐고,
 * 404는 라우트 미실행이 거의 확실합니다" §6 "가장 빠른 이분법":
 * `/course/{한글지역}/{한글일수}`가 배포 산출물에서 아예 실행되지
 * 않는 것인지(라우팅/빌드 문제), 한글 URL 세그먼트 자체가 문제인지
 * (인코딩 문제)를 가른다.
 *
 * ASCII 파라미터만 받아 내부에서 실제 지역명으로 매핑한 뒤, 실제
 * `/course/[region]/[days]`와 똑같이 `getCourseBrief`를 부른다 —
 * 진짜 라우트를 건드리지 않고 별도 경로로 같은 파이프라인을
 * 재현한다. 원인이 확인되면 이 라우트는 지운다 — 영구 기능이 아니다.
 *
 * 스타일 없는 순수 텍스트 응답이다 — 사용자에게 보여줄 화면이
 * 아니라 Cowork/동근님이 브라우저로 직접 열어 응답 자체(HTTP
 * 상태·시간·본문)를 확인하는 용도다.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // getCourseBrief가 Postgres(pg, Edge 비호환)를 쓴다 — 실제 코스 페이지와 같은 이유.

const REGION_SLUG_TO_NAME: Readonly<Record<string, string>> = {
  gyeongju: "경주",
};

const DAYS_SLUG_TO_COUNT: Readonly<Record<string, 1 | 2 | 3>> = {
  "1": 1,
  "2": 2,
  "3": 3,
};

interface CourseTestParams {
  region: string;
  days: string;
}

export default async function CourseTestPage({ params }: { params: Promise<CourseTestParams> }) {
  const { region: regionSlug, days: daysSlug } = await params;
  console.warn(`[course-test] entered: regionSlug=${regionSlug} daysSlug=${daysSlug}`);

  const region = REGION_SLUG_TO_NAME[regionSlug];
  const days = DAYS_SLUG_TO_COUNT[daysSlug];
  if (!region || !days) {
    return (
      <pre>
        course-test: 알 수 없는 슬러그입니다 (regionSlug={regionSlug}, daysSlug={daysSlug}).{"\n"}
        지원하는 값 — region: {Object.keys(REGION_SLUG_TO_NAME).join(", ")} / days: {Object.keys(DAYS_SLUG_TO_COUNT).join(", ")}
      </pre>
    );
  }

  let resultLine: string;
  try {
    const brief = await getCourseBrief(region, days);
    resultLine = `course-test OK — region=${region} days=${days}\n스팟 ${brief.spots.length}곳 · 총 ${brief.totalDistanceKm.toFixed(1)}km`;
  } catch (err) {
    resultLine = `course-test ERROR — region=${region} days=${days}\n${String(err)}`;
  }
  return <pre>{resultLine}</pre>;
}
