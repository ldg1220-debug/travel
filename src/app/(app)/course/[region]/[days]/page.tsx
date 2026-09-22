import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCourseBrief, UnsupportedRegionError, type CourseBrief } from "@/lib/server/courseBrief";
import { fetchRelatedTripPosts } from "@/lib/server/coursePageLinks";
import {
  buildCourseIntro,
  buildCourseItemListJsonLd,
  buildCourseTouristTripJsonLd,
  buildSpotDescription,
  isCourseBriefThin,
  isCoursePageEnabled,
  labelToDays,
} from "@/lib/coursePages";
import { CourseCtaLink } from "@/components/CourseCtaLink";

/**
 * `/course/{지역}/{일수}` — 작업지시서 2026-09-18 "트레쥴이 구글에
 * 7페이지만 올라가 있습니다" §4: course-brief가 이미 갖고 있는 실제
 * 코스(장소명·평점·리뷰수·구간 이동시간·지도)에 검색엔진이 색인할 수
 * 있는 주소를 준다. /discover가 클라이언트에서 그려 봇이 빈 페이지를
 * 보는 것과 정반대로, 이 페이지는 순수 서버 컴포넌트("use client" 없음)
 * 라 course-brief 데이터가 그대로 최초 HTML 응답에 담긴다.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60; // /api/content/course-brief와 같은 예산 — 코스 생성(LLM+DP)이 캐시 미스면 느릴 수 있다.

interface CoursePageParams {
  region: string;
  days: string;
}

/**
 * 작업지시서 2026-09-22 "sitemap에 올린 코스 페이지 20개가 전부
 * 404입니다" §2 이후 두 라운드에 걸친 히스토리:
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
 * 3) 지금은 getCourseBrief로 되돌리되, courseBrief.ts 쪽에 "같은
 *    (지역,일수)의 라이브 생성은 동시에 한 번만 돈다"는 보장
 *    (dedupeInFlight, 모듈 스코프 Map)을 추가했다 — React cache()는
 *    generateMetadata/페이지 사이에서 안 통했지만, 모듈 스코프 Map은
 *    같은 Node 프로세스 안에서 항상 공유된다. 이 cache()는 이제 정확성이
 *    아니라(courseBrief.ts 쪽이 이미 보장한다) 같은 요청 안 중복 DB
 *    조회 한 번을 아끼는 용도로만 남는다.
 */
const loadEnabledCourseBrief = cache(async (region: string, daysLabel: string): Promise<CourseBrief | null> => {
  const days = labelToDays(daysLabel);
  if (days == null || !isCoursePageEnabled(region, days)) return null;
  let brief: CourseBrief;
  try {
    brief = await getCourseBrief(region, days);
  } catch (err) {
    if (err instanceof UnsupportedRegionError) return null;
    throw err;
  }
  if (isCourseBriefThin(brief.spots)) return null;
  return brief;
});

export async function generateMetadata({ params }: { params: Promise<CoursePageParams> }): Promise<Metadata> {
  const { region, days: daysLabel } = await params;
  const brief = await loadEnabledCourseBrief(region, daysLabel);
  if (!brief) return { title: "코스를 찾을 수 없어요 - 트레쥴" };

  const title = `${region} ${daysLabel} 코스 — ${brief.spots.length}곳, 총 ${brief.totalDistanceKm.toFixed(1)}km`;
  const description = buildCourseIntro(brief);
  return {
    title,
    description,
    alternates: { canonical: `/course/${region}/${daysLabel}` },
    openGraph: {
      title,
      description,
      type: "article",
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
  const { region, days: daysLabel } = await params;
  const brief = await loadEnabledCourseBrief(region, daysLabel);
  if (!brief) {
    // 이 로그 하나가 §2류 회귀를 다음엔 실측 없이 바로 잡아준다 —
    // Vercel 로그에서 region·daysLabel을 보면 "허용목록에 없음"과
    // "캐시가 아직 안 채워짐"을 바로 구분할 수 있다.
    console.warn(`[course-page] notFound: region=${region} daysLabel=${daysLabel}`);
    notFound();
  }

  const intro = buildCourseIntro(brief);
  const itemListJsonLd = buildCourseItemListJsonLd(brief);
  const touristTripJsonLd = buildCourseTouristTripJsonLd(brief, intro);
  const relatedPosts = await fetchRelatedTripPosts(region).catch(() => []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* JSON-LD는 스크립트가 아니라 데이터라 XSS 경로가 아니다(작업지시서 §4 "JSON-LD ItemList + TouristTrip"). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(touristTripJsonLd) }} />

      <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">{region}</p>
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
        내 계획으로 담아가기
      </CourseCtaLink>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="py-2 pr-2 font-semibold">순서</th>
              <th className="py-2 pr-2 font-semibold">장소</th>
              <th className="py-2 font-semibold">평점 · 다음 이동</th>
            </tr>
          </thead>
          <tbody>
            {brief.spots.map((spot) => (
              <tr key={`${spot.day}-${spot.order}`} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="py-2 pr-2 tabular-nums text-slate-400">{spot.order}</td>
                <td className="py-2 pr-2 font-medium text-slate-800 dark:text-slate-100">{spot.name}</td>
                <td className="py-2 text-slate-500 dark:text-slate-400">{buildSpotDescription(spot)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
