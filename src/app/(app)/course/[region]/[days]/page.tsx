import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { getCourseBrief, type CourseBrief, type CourseDays } from "@/lib/server/courseBrief";
import { fetchRelatedTripPosts } from "@/lib/server/coursePageLinks";
import { judgeCourseBrief, resolveCoursePageRoute } from "@/lib/server/coursePageGate";
import { fetchConfirmedCoursePages, parentOfRegion, pickRelatedCourseLinks } from "@/lib/server/coursePageIndex";
import {
  buildCourseBreadcrumbJsonLd,
  buildCourseDescription,
  buildCourseIntro,
  buildCourseItemListJsonLd,
  buildCourseTitle,
  buildCourseTouristTripJsonLd,
  buildSpotDescription,
  courseCanonicalPath,
  daysToLabel,
  groupSpotsByDay,
} from "@/lib/coursePages";
import { CourseCtaLink } from "@/components/CourseCtaLink";
import { TravelpayoutsDriveScript } from "@/components/TravelpayoutsDriveScript";

/**
 * `/course/{지역}/{일수}` — 작업지시서 2026-09-18 "트레쥴이 구글에
 * 7페이지만 올라가 있습니다" §4: course-brief가 이미 갖고 있는 실제
 * 코스(장소명·평점·리뷰수·구간 이동시간·지도)에 검색엔진이 색인할 수
 * 있는 주소를 준다. /discover가 클라이언트에서 그려 봇이 빈 페이지를
 * 보는 것과 정반대로, 이 페이지는 순수 서버 컴포넌트("use client" 없음)
 * 라 course-brief 데이터가 그대로 최초 HTML 응답에 담긴다.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // 작업지시서 2026-09-22 "이번엔 라우트 자체가 인식되지 않습니다" §4 — pg(Postgres) 드라이버가 Edge 런타임과 호환되지 않는다. 다른 course-brief 소비처(route.ts들)는 App Router 기본 런타임(nodejs)으로 이미 잘 동작하지만, 이 페이지에서만 원인 불명으로 라우트 자체가 인식되지 않는 회귀가 있어 추론에 맡기지 않고 명시한다.
export const maxDuration = 60; // /api/content/course-brief와 같은 예산 — 코스 생성(LLM+DP)이 캐시 미스면 느릴 수 있다. 같은 값을 쓰는 그 라우트가 정상 동작하는 것으로 실측 확인돼(작업지시서 §5 회신), 이 값 자체가 이번 회귀의 원인은 아닌 것으로 판단한다 — 그래도 낮추지 않고 그대로 둔다.

interface CoursePageParams {
  region: string;
  days: string;
}

/**
 * 작업지시서 2026-09-23 "404 원인 확정: params가 디코딩되지 않습니다" —
 * Vercel 런타임 로그로 확정된 진짜 원인. 이전 라운드들은 `params.region`이
 * 이미 URL 디코딩된 "경주" 문자열로 온다고 가정했지만, 실측 로그는
 * `region="%EA%B2%BD%EC%A3%BC"`(퍼센트 인코딩 그대로), `codePoints`의
 * 첫 값이 37('%')임을 보여줬다 — 애초에 한글이 아니었다. #266의 NFC
 * 정규화(isCoursePageEnabled 내부)는 원인이 아니었다(인코딩된 문자열은
 * 정규화해도 "경주"가 되지 않는다) — 그래도 유지한다, 정상적으로
 * 디코딩된 입력에 NFC 변형이 섞이는 경우까지 함께 방어하기 위해서다.
 *
 * decodeURIComponent를 try/catch로 감싼다 — params가 이미 디코딩된
 * 상태(정상 케이스)에서 값 자체에 '%' 문자가 포함돼 있으면(예:
 * 실제로 '%'가 들어간 지역명은 없지만 방어적으로) URIError가 난다.
 * 디코딩 다음에 NFC 정규화한다 — 순서가 바뀌면 인코딩된 문자열을
 * 정규화하는 의미 없는 일이 된다.
 */
function normalizeParam(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // 이미 디코딩된 값이거나 '%'를 포함한 형식이 아닌 문자열 — 원본을 그대로 쓴다.
  }
  return decoded.normalize("NFC");
}

/**
 * 작업지시서 2026-09-22 "sitemap에 올린 코스 페이지 20개가 전부
 * 404입니다" §2 이후 세 라운드에 걸친 히스토리:
 *
 * 1) 원래 이 함수는 getCourseBrief(캐시 미스 시 라이브 생성 폴백)를
 *    썼는데, generateMetadata는 실제 코스를 불러오고 본문만 notFound()를
 *    던지는 모순이 실측됐다 — 캐시가 비어 있을 때 두 호출이 결과를
 *    공유하지 못한 채 각자 독립적으로 라이브 생성을 한 번씩 더 돌렸기
 *    때문으로 보인다(courseBrief.ts의 getCourseBrief/dedupeInFlight
 *    주석 참고 — 1일차 LLM 취향 큐레이션에 temperature 고정이 없어
 *    같은 입력에도 다른 결과가 날 수 있다).
 * 2) 그 다음 라운드(PR #262)는 라이브 생성 자체를 없앤 getCachedCourseBrief로
 *    바꿨는데, "캐시가 없으면 크론이 돌 때까지 무조건 404"라는 더 나쁜
 *    회귀를 냈다(작업지시서 "24개 전부 아직 404입니다").
 * 3) getCourseBrief로 되돌리고 courseBrief.ts에 dedupeInFlight(모듈
 *    스코프 Map)를 추가했는데(작업지시서 "이번엔 라우트 자체가 인식되지
 *    않습니다"), 이번엔 generateMetadata조차 실행되지 않는 것처럼
 *    보이는 더 심한 증상이 실측됐다 — Next 자체 404 문구가 아니라
 *    Vercel 플랫폼 404 문구("404: This page could not be found.",
 *    콜론 표기)에 가까워 코드가 아예 실행되지 않았거나 아주 이른
 *    단계에서 처리되지 않은 예외로 죽었을 가능성이 있다. 이 세션은
 *    Vercel 런타임 로그에 접근할 수 없어 확정하지 못했다 — 대신 아래
 *    catch를 UnsupportedRegionError만이 아니라 모든 에러로 넓혀서,
 *    getCourseBrief가 무엇을 던지든(예: LLM/외부 API 일시 장애, 환경
 *    변수 문제) 페이지가 정체불명의 방식으로 죽는 대신 항상 제어된
 *    notFound()로 내려가게 한다 — 로그로 원인은 남긴다.
 */
type LoadedCoursePage =
  | { kind: "ok"; brief: CourseBrief; region: string; days: CourseDays }
  | { kind: "redirect"; to: string }
  | { kind: "missing"; reason: string };

/**
 * 작업지시서 2026-10-08 "코스 페이지가 전부 404입니다" §1·§2 — 입구는 허용목록이 아니라
 * resolveCoursePageRoute(지원 지역 × 스타일별 일수 범위, 숫자 일수·별칭은 정본 주소로 리다이렉트)다.
 * 탈락하면 이유(region/days/brief 상태)를 한 줄로 남긴다.
 */
const loadCoursePage = cache(async (region: string, daysSegment: string): Promise<LoadedCoursePage> => {
  const route = resolveCoursePageRoute(region, daysSegment);
  if (route.kind === "redirect") return route;
  if (route.kind === "reject") {
    console.warn(`[course-page] gate rejected: region=${JSON.stringify(region)} daysSegment=${JSON.stringify(daysSegment)} reason=${route.reason}`);
    return { kind: "missing", reason: route.reason };
  }
  let brief: CourseBrief;
  try {
    brief = await getCourseBrief(route.region, route.days);
  } catch (err) {
    console.error(`[course-page] getCourseBrief threw: region=${route.region} days=${route.days}`, err);
    return { kind: "missing", reason: "brief-threw" };
  }
  // 작업지시서 2026-09-28 §2-② · 2026-09-29 "#277 검증" §2 — API(course-brief route.ts)·사이트맵과 같은
  // 기준(judgeCourseBrief: minViableSpots · 얇은 콘텐츠 · 휴양형 해변)을 쓴다.
  const rejected = judgeCourseBrief(brief, route.region, route.days);
  if (rejected) {
    console.warn(`[course-page] brief rejected: region=${route.region} days=${route.days} reason=${rejected}`);
    return { kind: "missing", reason: rejected };
  }
  return { kind: "ok", brief, region: route.region, days: route.days };
});

export async function generateMetadata({ params }: { params: Promise<CoursePageParams> }): Promise<Metadata> {
  const raw = await params;
  const loaded = await loadCoursePage(normalizeParam(raw.region), normalizeParam(raw.days));
  if (loaded.kind !== "ok") return { title: "코스를 찾을 수 없어요 - 트레쥴", robots: { index: false, follow: true } };
  const { brief, region, days } = loaded;

  const title = buildCourseTitle(brief);
  const description = buildCourseDescription(brief);
  const canonical = courseCanonicalPath(region, days);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "article",
      url: canonical,
      images: brief.imageUrl ? [{ url: brief.imageUrl, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: brief.imageUrl ? [brief.imageUrl] : undefined,
    },
  };
}

export default async function CoursePage({ params }: { params: Promise<CoursePageParams> }) {
  const raw = await params;
  const loaded = await loadCoursePage(normalizeParam(raw.region), normalizeParam(raw.days));
  if (loaded.kind === "redirect") permanentRedirect(loaded.to);
  if (loaded.kind === "missing") {
    // Vercel 로그에서 사유(unsupported-region · days-out-of-range · thin · no-beach · brief-threw)를 바로 본다.
    console.warn(`[course-page] notFound: region=${normalizeParam(raw.region)} daysSegment=${normalizeParam(raw.days)} reason=${loaded.reason}`);
    notFound();
  }
  const { brief, region, days } = loaded;
  const daysLabel = daysToLabel(days);

  const intro = buildCourseIntro(brief);
  const itemListJsonLd = buildCourseItemListJsonLd(brief);
  const touristTripJsonLd = buildCourseTouristTripJsonLd(brief, intro);
  const breadcrumbJsonLd = buildCourseBreadcrumbJsonLd(region, days);
  const dayGroups = groupSpotsByDay(brief);
  const [relatedPosts, confirmed] = await Promise.all([fetchRelatedTripPosts(region).catch(() => []), fetchConfirmedCoursePages()]);
  const related = pickRelatedCourseLinks({ region, days }, confirmed, parentOfRegion);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* JSON-LD는 스크립트가 아니라 데이터라 XSS 경로가 아니다(작업지시서 §4 "JSON-LD ItemList + TouristTrip"). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(touristTripJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      {/* 작업지시서 2026-10-08 "#300 검증" §2 — /course/** 도 Drive 로드(공유 토큰이 URL에 없다). */}
      <TravelpayoutsDriveScript />
      <nav aria-label="breadcrumb" className="text-[12px] text-slate-400">
        <Link href="/" className="hover:underline">트레쥴</Link> › <Link href="/course" className="hover:underline">코스</Link> › <span>{region} {daysLabel}</span>
      </nav>
      <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-brand-600">{region}</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
        {region} {daysLabel} 코스
      </h1>
      <p className="mt-2 text-[13.5px] text-slate-600 dark:text-slate-300">{intro}</p>

      {brief.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- Google Static Maps가 만드는 원격 PNG, next/image 최적화 대상이 아니다(course-brief의 다른 소비처와 같은 관례).
        <img
          src={brief.imageUrl}
          alt={`${region} ${daysLabel} 코스 동선 지도`}
          width={1200}
          height={630}
          className="mt-4 w-full rounded-2xl border border-slate-200 dark:border-slate-700"
        />
      )}

      <CourseCtaLink
        region={region}
        days={brief.days}
        className="mt-5 flex h-11 w-full items-center justify-center rounded-2xl bg-brand-700 text-[14px] font-semibold text-white transition-colors hover:bg-brand-800"
      >
        이 코스로 내 일정 만들기
      </CourseCtaLink>

      {/* 일자별 카드 — 장소 · 종류 · 평점 · 다음 이동을 텍스트로 렌더한다(이미지만 X, 블로그 일자 카드와 같은 데이터). */}
      <div className="mt-6 space-y-5">
        {dayGroups.map((group) => (
          <section key={group.day} aria-labelledby={`day-${group.day}`} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <h2 id={`day-${group.day}`} className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
              {group.day}일차
              <span className="ml-2 text-[12px] font-normal text-slate-500 dark:text-slate-400">
                {group.spots.length}곳{group.distanceKm != null ? ` · 이동 ${group.distanceKm.toFixed(1)}km` : ""}
                {group.facilityDay ? " · 종일 시설 일정" : ""}
              </span>
            </h2>
            <ol className="mt-3 space-y-3">
              {group.spots.map((spot) => (
                <li key={`${spot.day}-${spot.order}`} className="flex gap-3">
                  <span className="mt-0.5 w-5 shrink-0 text-right text-[13px] tabular-nums text-slate-400">{spot.order}</span>
                  <div>
                    <p className="text-[14px] font-medium text-slate-800 dark:text-slate-100">{spot.name}</p>
                    <p className="text-[12.5px] text-slate-500 dark:text-slate-400">{buildSpotDescription(spot)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      {(related.sameRegion.length > 0 || related.sameCountry.length > 0) && (
        <nav aria-label="관련 코스" className="mt-8 border-t border-slate-100 pt-4 dark:border-slate-800">
          {related.sameRegion.length > 0 && (
            <div>
              <p className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200">{region} 다른 일정</p>
              <ul className="flex flex-wrap gap-2">
                {related.sameRegion.map((p) => (
                  <li key={`${p.region}-${p.days}`}>
                    <Link href={courseCanonicalPath(p.region, p.days)} className="rounded-full border border-slate-200 px-3 py-1 text-[12.5px] text-brand-700 hover:bg-slate-50 dark:border-slate-700 dark:text-brand-400">
                      {p.region} {daysToLabel(p.days)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {related.sameCountry.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200">같은 나라·지역의 다른 코스</p>
              <ul className="flex flex-wrap gap-2">
                {related.sameCountry.map((p) => (
                  <li key={`${p.region}-${p.days}`}>
                    <Link href={courseCanonicalPath(p.region, p.days)} className="rounded-full border border-slate-200 px-3 py-1 text-[12.5px] text-brand-700 hover:bg-slate-50 dark:border-slate-700 dark:text-brand-400">
                      {p.region} {daysToLabel(p.days)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
      )}

      {relatedPosts.length > 0 && (
        <div className="mt-8 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200">{region} 여행 후기</p>
          <ul className="space-y-1.5">
            {relatedPosts.map((post) => (
              <li key={post.id}>
                <Link href={`/trip/${post.id}`} className="text-[13px] text-brand-700 hover:underline dark:text-brand-400">
                  {post.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
