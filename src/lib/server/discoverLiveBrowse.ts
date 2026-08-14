import type { Place } from "@/lib/types";
import {
  GENERATED_COLORS,
  GENERATED_GRADIENTS,
  seasonNow,
  type DiscoverScope,
  type DiscoverSpot,
  type PlaceCategoryTag,
  type SpotIconKey,
} from "@/lib/discoverData";
import { applyQualityGate, fetchSlotCandidates, isValidPlace, sameShop, type RecommendSlot } from "@/lib/server/courseRecommend";

/**
 * /discover의 지역별 드릴다운이 큐레이션 스팟 0개인 leaf(GitHub #164 —
 * 템플릿 생성 스팟 2,134곳을 지운 뒤 남는 대부분의 도시)에 도달했을 때,
 * "이 조건에 맞는 장소가 아직 없어요" 대신 실제 라이브 검색 결과로
 * 채운다. AI 코스 추천(courseRecommend.ts)의 fetchSlotCandidates를
 * 그대로 재사용 — place_candidate_cache 캐싱, Kakao category_group_code
 * 필터링, 품질 게이트가 이미 다 갖춰져 있고, 프로덕션 라이브 실측
 * (5개 도시 × 3개 카테고리, 2026-08-10)으로 품질이 확인됐다.
 */

const LIVE_BROWSE_CATEGORIES: { category: NonNullable<RecommendSlot["category"]>; tag: PlaceCategoryTag; iconKey: SpotIconKey; keyword: string }[] = [
  { category: "attraction", tag: "관광지", iconKey: "landmark", keyword: "관광지" },
  { category: "restaurant", tag: "음식점", iconKey: "utensils", keyword: "맛집" },
  { category: "cafe", tag: "카페", iconKey: "coffee", keyword: "카페" },
];

function placeToLiveSpot(p: Place, region: string, tag: PlaceCategoryTag, iconKey: SpotIconKey, index: number): DiscoverSpot {
  return {
    // "live:" 접두사로 큐레이션 스팟 id와 절대 충돌하지 않게 — 큐레이션
    // 쪽은 전부 "d-"/"o-"로 시작해 이 접두사와 겹칠 일이 없다.
    id: `live:${p.placeId || p.id}`,
    name: p.name,
    region,
    tag,
    season: seasonNow(),
    // saves는 애초에 없다 — 라이브 검색 결과는 트레쥴이 집계한 저장 수가
    // 없고, 없는 걸 있는 것처럼 채우지 않는다(#163와 같은 원칙).
    saves: 0,
    gradient: GENERATED_GRADIENTS[index % GENERATED_GRADIENTS.length],
    iconKey,
    lat: p.lat,
    lng: p.lng,
    color: GENERATED_COLORS[index % GENERATED_COLORS.length],
    placeId: p.placeId || undefined,
    // 실제 API 응답 그대로 — Google은 실평점, Kakao는 애초에 평점을 안 줘서
    // undefined로 남고, SpotCard는 #163부터 그 경우 지표 영역을 아예 렌더 안 함.
    rating: p.rating,
    reviewCount: p.reviewCount,
  };
}

/**
 * 한 도시의 관광지/음식점/카페 라이브 후보를 병합해 DiscoverSpot[]으로
 * 반환한다. 카테고리별로 최대 `perCategory`개만 취해 응답 크기를
 * 통제한다. 이름이 겹치는 항목(예: 실측에서 확인된 "경주 황리단길" /
 * "황리단길")은 sameShop으로 병합 — 원본 후보 리스트는
 * fetchSlotCandidates의 캐시에 영향 없이 그대로 두고, 여기서 표시
 * 단계에서만 걸러낸다.
 */
export async function fetchLiveBrowseSpots(
  scope: DiscoverScope,
  city: string,
  region: string,
  perCategory = 5,
  /**
   * 이미 큐레이션 쪽에 있는 스팟 이름 — "혼합 지역"(예: 서울·성수처럼
   * 큐레이션이 소수 남아 있어 라이브로 보강하는 경우)에서 같은 곳이
   * 라이브 결과에도 다시 뽑혀 중복 카드가 되는 걸 막는다. sameShop이
   * 지점명 차이("경주 황리단길" vs "황리단길")까지 잡아준다.
   */
  excludeNames: string[] = [],
): Promise<DiscoverSpot[]> {
  const courseScope = scope === "overseas" ? "overseas" : "domestic";
  const results = await Promise.all(
    LIVE_BROWSE_CATEGORIES.map(async ({ category, tag, iconKey, keyword }) => {
      const slot: RecommendSlot = { key: `browse-${category}`, label: keyword, keyword, hour: 12, category };
      const places = applyQualityGate(
        (await fetchSlotCandidates(courseScope, city, slot)).filter(isValidPlace),
        courseScope,
        category,
      );
      const deduped: Place[] = [];
      for (const p of places) {
        if (excludeNames.some((n) => sameShop(n, p.name))) continue;
        if (deduped.some((d) => sameShop(d.name, p.name))) continue;
        deduped.push(p);
        if (deduped.length >= perCategory) break;
      }
      return deduped.map((p, i) => placeToLiveSpot(p, region, tag, iconKey, i));
    }),
  );
  return results.flat();
}
