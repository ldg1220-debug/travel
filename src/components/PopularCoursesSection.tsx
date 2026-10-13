import Link from "next/link";
import { fetchConfirmedCoursePages, pickPopularCourses } from "@/lib/server/coursePageIndex";
import { COURSE_HUB_PATH, courseCanonicalPath, dayDisplayLabel } from "@/lib/coursePages";

/**
 * "인기 여행 코스" 섹션 — 작업지시서 2026-10-12 "코스 페이지가 고아입니다" §2③. 홈·/discover·/course의 서버 컴포넌트
 * 페이지에 넣어, 크롤러가 JS 없이 읽는 초기 HTML에 공개 코스 페이지(/course/{지역}/{일수}) 링크가 실리게 한다. 링크는
 * 사이트맵과 같은 소스(최근 30일 200 기록)의 조합뿐이고, /planner·/trip·course-open은 넣지 않는다. 확인된 조합이 없으면
 * 아무것도 그리지 않는다. 클라이언트 화면 아래에 이어 붙는 정적 링크 목록이다.
 */
export async function PopularCoursesSection({ limit = 12 }: { limit?: number }) {
  const popular = pickPopularCourses(await fetchConfirmedCoursePages(), limit);
  if (popular.length === 0) return null;
  return (
    <section aria-labelledby="popular-courses-heading" className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="popular-courses-heading" className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
          인기 여행 코스
        </h2>
        <Link href={COURSE_HUB_PATH} className="text-[12.5px] font-semibold text-brand-700 hover:underline dark:text-brand-400">
          전체 보기 →
        </Link>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {popular.map((p) => (
          <li key={`${p.region}-${p.days}`}>
            <Link
              href={courseCanonicalPath(p.region, p.days)}
              className="block rounded-xl border border-slate-200 px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="font-semibold">{p.region}</span> {dayDisplayLabel(p.region, p.days)}
              {p.info && p.info.reps.length > 0 && <span className="mt-0.5 block truncate text-[11.5px] text-slate-400">{p.info.reps.join(" · ")}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
