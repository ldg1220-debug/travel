import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { isSupportedRegion } from "@/lib/server/courseBrief";
import { resolveRegionAlias } from "@/lib/discoverData";
import { fetchConfirmedCoursePages } from "@/lib/server/coursePageIndex";
import { buildRegionHubJsonLd, COURSE_HUB_PATH, courseCanonicalPath, courseRegionHubPath, daysToLabel } from "@/lib/coursePages";
import { TravelpayoutsDriveScript } from "@/components/TravelpayoutsDriveScript";

/**
 * `/course/{지역}` — 지역 허브. 작업지시서 2026-10-12 "코스 페이지가 고아입니다" §2②: 그 지역의 확인된 모든 일수 코스 링크와
 * 일수별 곳 수·km. 확인된 조합이 하나도 없으면 색인하지 않는 빈 페이지(robots noindex)로 200을 낸다 — 브레드크럼이 이 주소를
 * 가리키는 코스 페이지가 막 만들어져 아직 기록이 없을 때 404가 되지 않게.
 */
export const dynamic = "force-dynamic";

interface Params {
  region: string;
}

function decodeRegion(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // 이미 디코딩된 값
  }
  return decoded.normalize("NFC");
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const region = resolveRegionAlias(decodeRegion((await params).region));
  if (!isSupportedRegion(region)) return { title: "코스를 찾을 수 없어요 - 트레쥴", robots: { index: false, follow: true } };
  const pages = (await fetchConfirmedCoursePages()).filter((p) => p.region === region).sort((a, b) => a.days - b.days);
  if (pages.length === 0) return { title: { absolute: `${region} 여행 코스 | 트레쥴` }, robots: { index: false, follow: true } };
  const first = daysToLabel(pages[0].days);
  const last = daysToLabel(pages[pages.length - 1].days);
  const title = `${region} 여행 코스 — ${pages.length === 1 ? first : `${first}~${last}`} 일자별 동선 | 트레쥴`;
  const description = `${region} 여행 코스 ${pages.length}개(${pages.map((p) => daysToLabel(p.days)).join("·")}): 일자별 동선 지도 · 이동 시간 · 평점 정리.`;
  return { title: { absolute: title }, description, alternates: { canonical: courseRegionHubPath(region) }, openGraph: { title, description, type: "website", url: courseRegionHubPath(region) } };
}

export default async function RegionHubPage({ params }: { params: Promise<Params> }) {
  const raw = decodeRegion((await params).region);
  const region = resolveRegionAlias(raw);
  if (!isSupportedRegion(region)) notFound();
  if (region !== raw) permanentRedirect(courseRegionHubPath(region));
  const pages = (await fetchConfirmedCoursePages()).filter((p) => p.region === region).sort((a, b) => a.days - b.days);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {pages.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildRegionHubJsonLd(region, pages.map((p) => p.days))) }} />}
      <TravelpayoutsDriveScript />
      <nav aria-label="breadcrumb" className="text-[12px] text-slate-400">
        <Link href="/" className="hover:underline">트레쥴</Link> › <Link href={COURSE_HUB_PATH} className="hover:underline">여행 코스 모음</Link> › <span>{region}</span>
      </nav>
      <h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100">{region} 여행 코스</h1>
      {pages.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-slate-600 dark:text-slate-300">
          {region} 코스를 준비하고 있어요. <Link href="/course" className="font-semibold text-brand-700 hover:underline dark:text-brand-400">직접 코스 만들기 →</Link>
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {pages.map((p) => (
            <li key={p.days}>
              <Link href={courseCanonicalPath(p.region, p.days)} className="block rounded-2xl border border-slate-200 px-4 py-3 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <span className="text-[14.5px] font-semibold text-slate-900 dark:text-slate-100">{region} {daysToLabel(p.days)} 코스</span>
                {p.info && (
                  <span className="mt-0.5 block text-[12.5px] text-slate-500 dark:text-slate-400">
                    {p.info.spotCount}곳{p.info.totalDistanceKm != null ? ` · 이동 ${p.info.totalDistanceKm.toFixed(1)}km` : ""}
                    {p.info.reps.length > 0 ? ` · ${p.info.reps.join("·")}` : ""}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-[12.5px]">
        <Link href={COURSE_HUB_PATH} className="font-semibold text-brand-700 hover:underline dark:text-brand-400">← 전체 코스 모음</Link>
      </p>
    </div>
  );
}
