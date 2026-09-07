import { describe, expect, it } from "vitest";
import { capAllDayFacilityDays, clusterByLocation, dedupeByProximity, orderByNearestNeighbor, rebalanceByDistance } from "./courseBrief";
import { haversineKm } from "./courseRoute";

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

function totalDistance(group: P[]): number {
  let sum = 0;
  for (let i = 0; i < group.length - 1; i++) sum += haversineKm(group[i], group[i + 1]);
  return sum;
}

describe("rebalanceByDistance", () => {
  it("moves a distant outlier out of the long day into the short day until the ratio is within bounds (다자이후 case)", () => {
    // 촘촘한 3곳 + 약 9km 떨어진 이상치 1곳(다자이후처럼 도심 클러스터에
    // 섞인 원거리 단일 지점) vs. 그 이상치 바로 근처의 짧은 날.
    const outlier = p(34.6, 135.6);
    const dayLong = [p(34.6, 135.5), p(34.601, 135.501), p(34.599, 135.499), outlier];
    const dayShort = [p(34.601, 135.601), p(34.599, 135.599), p(34.6, 135.6001)];

    const result = rebalanceByDistance([dayLong, dayShort], () => false);

    expect(result.flat()).toHaveLength(dayLong.length + dayShort.length); // 총 개수 보존
    expect(result[0]).not.toContain(outlier);
    expect(result[1]).toContain(outlier);

    const distances = result.map((g) => Math.max(totalDistance(g), 0.001)); // 0 나눗셈 방지
    expect(Math.max(...distances) / Math.min(...distances)).toBeLessThanOrEqual(1.5);
  });

  it("never moves a stop into a day that contains an all-day facility, even if it's the shortest", () => {
    interface FacSpot extends P {
      isBig: boolean;
    }
    const isFacility = (s: FacSpot) => s.isBig;
    const outlier: FacSpot = { ...p(34.6, 135.6), isBig: false };
    const dayLong: FacSpot[] = [{ ...p(34.6, 135.5), isBig: false }, { ...p(34.601, 135.501), isBig: false }, { ...p(34.599, 135.499), isBig: false }, outlier];
    // 거리상 가장 짧은(0km, 단일 스팟) 날이지만 종일시설이 있어 후보에서 제외돼야 한다.
    const dayFacility: FacSpot[] = [{ ...p(34.7, 135.4), isBig: true }];
    // 시설은 없지만 두 번째로 짧은 날 — 여기로 옮겨가야 한다.
    const dayOther: FacSpot[] = [{ ...p(34.601, 135.601), isBig: false }, { ...p(34.6, 135.6001), isBig: false }];

    const result = rebalanceByDistance([dayLong, dayFacility, dayOther], isFacility);

    expect(result[1]).toEqual(dayFacility); // 시설 날짜는 절대 손대지 않는다
    expect(result[2]).toContain(outlier); // 옮겨간 곳은 시설 없는 날
  });

  it("returns groups unchanged when there is only one group", () => {
    const single = [[p(0, 0), p(1, 1)]];
    expect(rebalanceByDistance(single, () => false)).toEqual(single);
  });

  it("never ends up worse than the starting deviation, even with a Dazaifu-like outlier (후쿠오카 실측 회귀 방지, 작업지시서 2026-09-07 'PR #235 프로덕션 검증' §1)", () => {
    // 실측: day1 6.58km(9곳) / day2 15.36km(6곳, 다자이후 포함) / day3
    // 11.50km(3곳) — 편차 2.33배. 이전 구현("가장 먼 스팟 무조건 이동")은
    // 이걸 11.82배로 악화시켰다. 정확히 같은 숫자를 재현할 필요는 없고,
    // "같은 구조(도심 클러스터 + 원거리 이상치 1곳)에서 절대 더 나빠지지
    // 않는다"만 고정하면 된다.
    const day1 = [p(33.59, 130.4), p(33.5905, 130.4005), p(33.591, 130.401), p(33.5895, 130.3995), p(33.592, 130.402), p(33.589, 130.399)]; // 텐진권 — 촘촘
    const day2 = [p(33.595, 130.42), p(33.596, 130.422), p(33.47, 130.535)]; // 하카타권 2곳 + 다자이후(이상치)
    const day3 = [p(33.65, 130.35), p(33.652, 130.353), p(33.648, 130.348)]; // 우미노나카미치권 — 촘촘

    const groups = [day1, day2, day3];
    const totalStops = groups.flat().length;
    const before = groups.map(totalDistance);
    const beforeRatio = Math.max(...before) / Math.max(Math.min(...before), 0.001);

    const result = rebalanceByDistance(groups, () => false);

    expect(result.flat()).toHaveLength(totalStops); // 스팟이 사라지거나 늘지 않는다
    const after = result.map(totalDistance);
    const afterRatio = Math.max(...after) / Math.max(Math.min(...after), 0.001);
    expect(afterRatio).toBeLessThanOrEqual(beforeRatio + 1e-9); // 절대 악화되지 않는다 — 이번 수정의 핵심 불변조건
  });
});

describe("capAllDayFacilityDays — 항상 가장 가까운 동반 스팟을 남긴다(거리 문턱 없음)", () => {
  interface FacSpot extends P {
    isBig: boolean;
  }
  const isFacility = (s: FacSpot) => s.isBig;

  it("keeps the 2 closest companions even when they're far away, rather than leaving the facility alone (마린월드 case, 작업지시서 2026-09-07 'PR #236 프로덕션 검증' §1/§3)", () => {
    // 반도 끝 같은 고립된 시설 — 근처(5km 이내)엔 아무것도 없다. PR #235의
    // 거리 문턱(5km) 버전은 이걸 전부 걸러내 시설 단독(1곳) 날짜를
    // 만들었다("가까운 걸 고른다"가 아니라 "전부 버린다"로 작동). 이제는
    // 거리 문턱 없이 그냥 가장 가까운 2곳을 남긴다.
    const facility: FacSpot = { ...p(33.65, 130.35), isBig: true };
    const near: FacSpot = { ...p(33.6, 130.3), isBig: false }; // ~7km
    const farther: FacSpot = { ...p(33.55, 130.25), isBig: false }; // ~14km
    const evenFarther: FacSpot = { ...p(33.5, 130.2), isBig: false }; // ~21km
    const day = [facility, near, farther, evenFarther];
    const otherDay: FacSpot[] = [{ ...p(33.59, 130.4), isBig: false }];

    const result = capAllDayFacilityDays([day, otherDay], isFacility);

    expect(result[0]).toHaveLength(3); // 시설 + 가장 가까운 2곳 — 절대 1곳(시설 단독)으로 떨어지지 않는다
    expect(result[0]).toContain(facility);
    expect(result[0]).toContain(near);
    expect(result[0]).toContain(farther);
    expect(result.flat()).toHaveLength(day.length + otherDay.length); // 넘친 스팟도 사라지지 않는다
  });

  it("spreads overflow stops across multiple days instead of dumping them all into the single nearest one, respecting the per-day cap (후쿠오카 day1 15곳 회귀 방지, §3)", () => {
    const facility: FacSpot = { ...p(33.65, 130.35), isBig: true };
    const companions: FacSpot[] = [{ ...p(33.651, 130.351), isBig: false }, { ...p(33.652, 130.352), isBig: false }];
    // 넘칠 스팟 6곳 — 전부 dayA에 가장 가깝지만(dayA가 시설과 더 가까운
    // 동네), dayA는 이미 스팟이 있어 8곳 상한을 넘기면 dayB로도 분산돼야
    // 한다.
    const overflow: FacSpot[] = Array.from({ length: 6 }, (_, i) => ({ ...p(33.6 + i * 0.001, 130.3 + i * 0.001), isBig: false }));
    const day = [facility, ...companions, ...overflow];
    const dayA: FacSpot[] = [{ ...p(33.59, 130.29), isBig: false }, { ...p(33.591, 130.291), isBig: false }, { ...p(33.592, 130.292), isBig: false }];
    const dayB: FacSpot[] = [{ ...p(33.4, 130.1), isBig: false }]; // 훨씬 먼 동네 — 그래도 dayA가 가득 차면 여기로 가야 한다

    const result = capAllDayFacilityDays([day, dayA, dayB], isFacility);

    expect(result.flat()).toHaveLength(day.length + dayA.length + dayB.length); // 개수 보존
    expect(result[0]).toHaveLength(3); // 시설 날짜는 3곳으로 고정
    result.forEach((g) => expect(g.length).toBeLessThanOrEqual(8)); // 어떤 날도 8곳을 넘지 않는다
    expect(result[2].length).toBeGreaterThan(dayB.length); // dayA가 가득 차면 dayB도 받는다
  });

  it("keeps a single close companion untouched when there's nothing to overflow", () => {
    const facility: FacSpot = { ...p(34.665, 135.433), isBig: true };
    const nearCompanion: FacSpot = { ...p(34.667, 135.44), isBig: false };
    const day = [facility, nearCompanion];
    const otherDay: FacSpot[] = [{ ...p(34.6, 135.5), isBig: false }];

    const result = capAllDayFacilityDays([day, otherDay], isFacility);

    expect(result[0]).toEqual([facility, nearCompanion]);
    expect(result[1]).toEqual(otherDay); // 옮겨간 것 없음
  });
});

describe("rebalanceByDistance never grows a day beyond 8 stops chasing distance (후쿠오카 day1 15곳 회귀 방지 — 2라운드)", () => {
  it("stops moving stops into a day once it's already at the cap, even though doing so would reduce the max distance further", () => {
    // day1은 정확히 상한(8곳, 촘촘) / day2(6곳, day1보다 훨씬 넓게 퍼져
    // 있어 이동거리가 김) — day2가 이동거리 최댓값이라 재균형이 day2에서
    // day1로 스팟을 옮기려 들 것이다. 자체 검증에서 이런 이동이 반복돼
    // 한쪽 날이 15곳까지 불어나는 걸 실제로 겪었다 — 8곳 상한이 day1을
    // 더는 못 받게 막아야 한다(이미 상한인 날을 그 이하로 줄이는 것까지
    // 보장하지는 않는다 — 그건 별개의 보장이다).
    const day1: P[] = Array.from({ length: 8 }, (_, i) => p(33.59 + i * 0.001, 130.4 + i * 0.001));
    const day2: P[] = Array.from({ length: 6 }, (_, i) => p(33.595 + i * 0.01, 130.42 + i * 0.01));

    const result = rebalanceByDistance([day1, day2], () => false);

    expect(result.flat()).toHaveLength(day1.length + day2.length); // 개수 보존
    expect(result[0]).toHaveLength(8); // 이미 상한인 day1은 더 받지 않는다
    result.forEach((g) => expect(g.length).toBeGreaterThanOrEqual(3)); // 어떤 날도 3곳 밑으로 줄지 않는다
  });
});
