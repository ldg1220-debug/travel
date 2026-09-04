import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { regionHierarchy, type RegionNode } from "@/lib/discoverData";

/**
 * 트레쥴 콘텐츠 API — AutoPipeline이 블로그 시드(지역 × 코스 패턴)를
 * 만들 때 쓸 지역 목록. 작업지시서 2026-09-05 "트레쥴 다음 작업" §1 —
 * AutoPipeline이 지역 목록 API가 없어 35개 지역을 하드코딩해 쓰고
 * 있었고, 나머지 170여 곳은 글이 아예 안 나오는 상태였다.
 *
 * 새 데이터를 만들지 않고 /api/discover/trends가 쓰는 regionHierarchy()
 * (discoverData.ts)를 그대로 평탄화한다 — "같은 소스"를 쓰라는 지시서
 * 요건. course-brief?region=에 그대로 넣어 동작해야 하므로, 실제
 * "도시/동네" 단위 노드만 뽑는다:
 *
 * - 국내: regionHierarchy는 광역(1레벨) → 시/군/동네(2레벨) → 동(3레벨,
 *   실데이터에서 병합)까지 3단계지만, course-brief의 region은 시/군
 *   단위("경주", "안동")나 서울·부산·인천·제주 같은 독립 권역의 동네
 *   단위("홍대", "해운대")를 기대한다 — 그래서 2레벨 전부를 지역으로
 *   내고, 데이터에서만 병합되는 3레벨(동)은 쓰지 않는다.
 * - 해외: 대륙(1) → 국가(2) → 도시(3) 3단계 그대로가 course-brief의
 *   기대 단위라 3레벨(도시)을 지역으로, 2레벨(국가)을 parent로 낸다.
 *
 * 지시서 요건대로 스팟이 적거나 없는 지역도 거르지 않는다 —
 * regionHierarchy() 자체가 이미 "데이터가 아직 없어도 안전한" 정본
 * 목록(regions.ts DOMESTIC_CANONICAL, discoverData.ts WORLD_CITIES)이라
 * 별도 필터가 필요 없다. 부실 지역(스팟 3개 미만) 스킵은 AutoPipeline
 * 쪽 책임으로 남긴다.
 */

interface ContentRegion {
  name: string;
  parent: string;
}

function flattenDomestic(tree: RegionNode[]): ContentRegion[] {
  const out: ContentRegion[] = [];
  for (const province of tree) {
    for (const city of province.children) {
      out.push({ name: city.label, parent: province.label });
    }
  }
  return out;
}

function flattenOverseas(tree: RegionNode[]): ContentRegion[] {
  const out: ContentRegion[] = [];
  for (const continent of tree) {
    for (const country of continent.children) {
      for (const city of country.children) {
        out.push({ name: city.label, parent: country.label });
      }
    }
  }
  return out;
}

export const revalidate = 86400; // 지시서 요건 "캐시 24시간 이상" — 정본 카탈로그 기반이라 사실상 정적에 가깝다.

export const GET = withApiErrorHandling(async () => {
  return NextResponse.json(
    {
      domestic: flattenDomestic(regionHierarchy("domestic")),
      overseas: flattenOverseas(regionHierarchy("overseas")),
    },
    { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
});
