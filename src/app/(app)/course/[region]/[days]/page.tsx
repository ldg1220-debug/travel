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
 * generateMetadata와 페이지 컴포넌트가 같은 요청 안에서 두 번 로드하지
 * 않도록 React cache()로 묶는다 — course-brief 자체도 별도 캐시가 있어
 * 중복 호출이 치명적이진 않지만, 굳이 두 번 부를 이유가 없다.
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
  if (!brief) notFound();

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
