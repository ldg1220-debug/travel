import type { Metadata } from "next";
import Link from "next/link";
import { splitTypicalPages } from "@/lib/regionTypicalDays";
import { fetchConfirmedCoursePages, groupConfirmedForHub } from "@/lib/server/coursePageIndex";
import { buildCourseHubDescription, buildCourseHubJsonLd, buildCourseHubTitle, COURSE_HUB_PATH, courseCanonicalPath, courseRegionHubPath, dayDisplayLabel } from "@/lib/coursePages";
import { TravelpayoutsDriveScript } from "@/components/TravelpayoutsDriveScript";

/**
 * `/course/all` — 코스 허브. 작업지시서 2026-10-12 "코스 페이지가 고아입니다" §2①: 사이트의 어떤 상위 페이지에서도 코스 페이지로
 * 가는 링크가 없어 구글이 사이트맵으로만 발견한 코스 페이지를 "발견됨 – 현재 색인 생성되지 않음"으로 오래 둔다. 이 서버
 * 렌더 페이지가 나라 → 지역 → 일수 칩의 정적 링크를 전부 건다. 링크는 사이트맵과 같은 소스(최근 30일 200 기록) 조합뿐이다.
 * (Drive는 코스 계열 페이지 정책과 같이 로드한다. /planner·/trip·course-open 링크는 넣지 않는다.)
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const confirmed = await fetchConfirmedCoursePages();
  const regionCount = new Set(confirmed.map((p) => p.region)).size;
  const title = regionCount > 0 ? buildCourseHubTitle(regionCount) : "여행 코스 모음 | 트레쥴";
  const description = buildCourseHubDescription(regionCount, confirmed.length);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: COURSE_HUB_PATH },
    openGraph: { title, description, type: "website", url: COURSE_HUB_PATH },
  };
}

export default async function CourseHubPage() {
  const confirmed = await fetchConfirmedCoursePages();
  const groups = groupConfirmedForHub(confirmed);
  const regionCount = groups.reduce((n, g) => n + g.regions.length, 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildCourseHubJsonLd(confirmed)) }} />
      <TravelpayoutsDriveScript />
      <nav aria-label="breadcrumb" className="text-[12px] text-slate-400">
        <Link href="/" className="hover:underline">트레쥴</Link> › <span>여행 코스 모음</span>
      </nav>
      <h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100">여행 코스 모음</h1>
      <p className="mt-2 text-[13.5px] text-slate-600 dark:text-slate-300">
        {regionCount > 0 ? buildCourseHubDescription(regionCount, confirmed.length) : "코스를 준비하고 있어요. 잠시 후 다시 확인해 주세요."}
      </p>
      <p className="mt-2 text-[12.5px]">
        <Link href="/course" className="font-semibold text-brand-700 hover:underline dark:text-brand-400">직접 코스 만들기 →</Link>
      </p>

      {groups.map((group) => (
        <section key={`${group.scope}-${group.parent}`} aria-labelledby={`g-${group.scope}-${group.parent}`} className="mt-8">
          <h2 id={`g-${group.scope}-${group.parent}`} className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
            {group.parent}
            <span className="ml-2 text-[12px] font-normal text-slate-400">{group.scope === "domestic" ? "국내" : "해외"}</span>
          </h2>
          <ul className="mt-3 space-y-3">
            {group.regions.map((r) => (
              <li key={r.region} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex gap-3">
                  {r.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- 코스 지도 PNG(/api/blob/course-maps/…) 썸네일, next/image 대상이 아니다.
                    <img src={r.imageUrl} alt={`${r.region} 코스 동선 지도`} width={96} height={96} loading="lazy" className="h-16 w-16 shrink-0 rounded-xl border border-slate-100 object-cover dark:border-slate-800" />
                  )}
                  <div className="min-w-0">
                    <Link href={courseRegionHubPath(r.region)} className="text-[14.5px] font-semibold text-slate-900 hover:underline dark:text-slate-100">
                      {r.region}
                    </Link>
                    {r.reps.length > 0 && <p className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400">{r.reps.join(" · ")}</p>}
                    {(() => {
                      const { typical, others } = splitTypicalPages(r.pages);
                      const chip = (p: (typeof r.pages)[number]) => (
                        <li key={p.days}>
                          <Link href={courseCanonicalPath(p.region, p.days)} className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[12px] text-brand-700 hover:bg-slate-50 dark:border-slate-700 dark:text-brand-400">
                            {dayDisplayLabel(p.region, p.days)}
                          </Link>
                        </li>
                      );
                      return (
                        <>
                          <ul className="mt-2 flex flex-wrap gap-1.5">{typical.map(chip)}</ul>
                          {others.length > 0 && (
                            <details className="mt-1.5">
                              <summary className="cursor-pointer text-[11.5px] text-slate-400">다른 일수</summary>
                              <ul className="mt-1.5 flex flex-wrap gap-1.5">{others.map(chip)}</ul>
                            </details>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
