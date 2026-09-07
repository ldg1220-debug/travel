import { describe, expect, it } from "vitest";
import { capAllDayFacilityDays, clusterByLocation, dedupeByProximity, orderByNearestNeighbor } from "./courseBrief";

// 오사카 실측(작업지시서 2026-09-06 "일자 배분이 지리적으로 나뉘지
// 않습니다")에서 확인된 문제(같은 구역이 여러 날에 흩어짐, 하루 안에서
// 도시 반대편을 왕복, 종일 시설 뒤에 다른 스팟이 붙음, 이름이 달라도
// 같은 장소인 근접쌍)를 각 헬퍼가 실제로 해소하는지 확인한다.

interface P {
  lat: number;
  lng: number;
}
function p(lat: number, lng: number): P {
  return { lat, lng };
}

describe("clusterByLocation", () => {
  it("separates two well-separated groups of points into distinct clusters", () => {
    // 미나미(난바) 쪽 5곳 vs 키타(우메다) 쪽 5곳 — 두 구역은 서로 5km 이상 떨어져 있다.
    const minami = [p(34.665, 135.5), p(34.666, 135.501), p(34.667, 135.502), p(34.668, 135.5), p(34.669, 135.503)];
    const kita = [p(34.705, 135.495), p(34.706, 135.496), p(34.707, 135.497), p(34.708, 135.495), p(34.709, 135.498)];
    const groups = clusterByLocation([...minami, ...kita], 2);

    expect(groups).toHaveLength(2);
    // 그룹당 5개씩 고르게 나뉘어야 한다(균형 잡기 패스).
    expect(groups.map((g) => g.length).sort()).toEqual([5, 5]);
    // 각 그룹은 한쪽 구역의 점만 담아야 한다 — 섞이면 안 된다.
    for (const group of groups) {
      const isAllMinami = group.every((pt) => minami.includes(pt));
      const isAllKita = group.every((pt) => kita.includes(pt));
      expect(isAllMinami || isAllKita).toBe(true);
    }
  });

  it("returns one group per point when there are fewer points than k", () => {
    const groups = clusterByLocation([p(0, 0), p(1, 1)], 3);
    expect(groups.flat()).toHaveLength(2);
    expect(groups.every((g) => g.length > 0)).toBe(true);
  });

  it("returns everything in one group when k is 1", () => {
    const groups = clusterByLocation([p(0, 0), p(1, 1), p(2, 2)], 1);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });
});

describe("orderByNearestNeighbor", () => {
  it("avoids zigzagging across a simple back-and-forth input", () => {
    // 입력 순서 자체가 지그재그(0, 10, 1, 11, 2, 12, …)인 경우 — 최근접
    // 이웃 정렬은 한쪽 끝에서 시작해 순서대로 훑어야 한다.
    const zigzag = [p(0, 0), p(0, 10), p(0, 1), p(0, 11), p(0, 2), p(0, 12)];
    const ordered = orderByNearestNeighbor(zigzag);
    const lngs = ordered.map((s) => s.lng);
    // 처음 세 개는 전부 0km대(0,1,2)이거나 전부 10km대(10,11,12)여야 한다 — 왕복이 없다는 뜻.
    const firstThreeAllLow = lngs.slice(0, 3).every((lng) => lng < 5);
    const firstThreeAllHigh = lngs.slice(0, 3).every((lng) => lng >= 5);
    expect(firstThreeAllLow || firstThreeAllHigh).toBe(true);
  });

  it("leaves 2 or fewer points unchanged", () => {
    const stops = [p(0, 0), p(1, 1)];
    expect(orderByNearestNeighbor(stops)).toEqual(stops);
  });
});

interface TestSpot {
  lat: number;
  lng: number;
  category: string;
  reviewCount?: number | null;
}
function spot(lat: number, lng: number, category: string, reviewCount: number | null = null): TestSpot {
  return { lat, lng, category, reviewCount };
}

describe("dedupeByProximity", () => {
  it("removes a same-category pair 30m apart even though names would never match (하루카스300/아베노하루카스)", () => {
    const a = spot(34.6459, 135.5135, "tourist_attraction", 100);
    const b = { ...spot(34.646, 135.5136, "tourist_attraction", 9000) }; // ~30m away, more reviews
    const result = dedupeByProximity([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].reviewCount).toBe(9000); // 리뷰 수 많은 쪽을 남긴다
  });

  it("removes a same-category pair ~155m apart via the soft (same-category) tier (쓰텐카쿠/신세카이 case)", () => {
    const a = spot(34.6524, 135.5063, "tourist_attraction", 5000);
    const b = spot(34.6538, 135.5063, "tourist_attraction", 6000); // ~155m north — beyond the 100m hard tier, within the 300m soft tier
    expect(dedupeByProximity([a, b])).toHaveLength(1);
  });

  it("keeps a close pair (~200m) when categories differ", () => {
    const restaurant = spot(34.6687, 135.5013, "restaurant", 500);
    const attraction = spot(34.6705, 135.5013, "tourist_attraction", 500); // ~200m away
    expect(dedupeByProximity([restaurant, attraction])).toHaveLength(2);
  });

  it("keeps two same-category spots far apart (300m+)", () => {
    const a = spot(34.6, 135.5, "cafe", 100);
    const b = spot(34.605, 135.5, "cafe", 100); // ~550m away
    expect(dedupeByProximity([a, b])).toHaveLength(2);
  });
});

describe("capAllDayFacilityDays", () => {
  interface FacilitySpot extends P {
    isBig: boolean;
  }
  const isFacility = (s: FacilitySpot) => s.isBig;

  it("caps a day containing an all-day facility to at most 3 stops total", () => {
    const facility: FacilitySpot = { ...p(34.7, 135.4), isBig: true };
    const day1 = [
      facility,
      { ...p(34.68, 135.5), isBig: false },
      { ...p(34.66, 135.49), isBig: false },
      { ...p(34.69, 135.44), isBig: false },
      { ...p(34.65, 135.49), isBig: false },
      { ...p(34.7, 135.45), isBig: false },
    ];
    const day2 = [{ ...p(34.66, 135.5), isBig: false }, { ...p(34.665, 135.501), isBig: false }];
    const result = capAllDayFacilityDays([day1, day2], isFacility);

    expect(result[0].length).toBeLessThanOrEqual(3);
    expect(result[0].some(isFacility)).toBe(true);
    // 넘친 스팟은 사라지지 않고 다른 날로 옮겨가야 한다 — 전체 개수는 그대로.
    expect(result.flat()).toHaveLength(day1.length + day2.length);
  });

  it("leaves groups untouched when there is only one day", () => {
    const single = [[{ ...p(0, 0), isBig: true }, { ...p(0, 1), isBig: false }, { ...p(0, 2), isBig: false }, { ...p(0, 3), isBig: false }]];
    expect(capAllDayFacilityDays(single, isFacility)).toEqual(single);
  });
});
