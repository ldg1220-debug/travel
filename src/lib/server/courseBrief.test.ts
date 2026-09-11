import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyDurationCap,
  capAllDayFacilityDays,
  chunkByProximity,
  clusterByLocation,
  dedupeByBrand,
  dedupeByProximity,
  fetchGoogleDirectionsRoute,
  fetchKakaoDrivingRoute,
  fetchLegRoute,
  mapPathParam,
  medoidOf,
  orderByNearestNeighbor,
  planRouteForDay,
  reallocateStopsByDay,
  reassignByCentroid,
  rebalanceByDistance,
  simplifyPath,
  straightRouteMeasurement,
  type RouteResult,
} from "./courseBrief";
import { haversineKm } from "./courseRoute";
import type { FinalStop } from "./courseRecommendV2";

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

  it("leaves only the facility on a day that has one — no companions kept (작업지시서 2026-09-08 'PR #239 프로덕션 검증' §2)", () => {
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

    expect(result[0]).toEqual([facility]);
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

describe("capAllDayFacilityDays — 동반 스팟은 거리와 무관하게 전부 뺀다 (작업지시서 2026-09-08 'PR #239 프로덕션 검증' §2)", () => {
  interface FacSpot extends P {
    isBig: boolean;
  }
  const isFacility = (s: FacSpot) => s.isBig;

  it("evicts every companion, however close, leaving the facility alone (마린월드 case)", () => {
    // 반도 끝 같은 고립된 시설이라도 이제 동반 스팟을 붙이지 않는다 —
    // 예전엔(작업지시서 2026-09-07 'PR #236 프로덕션 검증' §1/§3) 거리
    // 문턱 없이 가장 가까운 2곳을 남겼지만, 그게 스팟 단위로 청크(소구역)를
    // 갈라내는 원인이었다(작업지시서 2026-09-08 "PR #239 프로덕션 검증"
    // §2). 시설 단독 날짜의 이동거리 0km가 편차 계산을 왜곡하던 문제는
    // rebalanceByDistance/reassignByCentroid가 이미 해결했으니 더는
    // 동반 스팟이 필요 없다.
    const facility: FacSpot = { ...p(33.65, 130.35), isBig: true };
    const near: FacSpot = { ...p(33.6, 130.3), isBig: false }; // ~7km
    const farther: FacSpot = { ...p(33.55, 130.25), isBig: false }; // ~14km
    const day = [facility, near, farther];
    const otherDay: FacSpot[] = [{ ...p(33.59, 130.4), isBig: false }];

    const result = capAllDayFacilityDays([day, otherDay], isFacility);

    expect(result[0]).toEqual([facility]);
    expect(result.flat()).toHaveLength(day.length + otherDay.length); // 넘친 스팟도 사라지지 않는다
  });

  it("spreads evicted companions across multiple days instead of dumping them all into the single nearest one, respecting the per-day cap (후쿠오카 day1 15곳 회귀 방지, §3)", () => {
    const facility: FacSpot = { ...p(33.65, 130.35), isBig: true };
    const companions: FacSpot[] = [{ ...p(33.651, 130.351), isBig: false }, { ...p(33.652, 130.352), isBig: false }];
    // 넘칠 스팟 6곳 — 전부 dayA에 가장 가깝지만(dayA가 시설과 더 가까운
    // 동네), dayA는 이미 스팟이 있어 6곳 상한을 넘기면 dayB로도 분산돼야
    // 한다.
    const overflow: FacSpot[] = Array.from({ length: 6 }, (_, i) => ({ ...p(33.6 + i * 0.001, 130.3 + i * 0.001), isBig: false }));
    const day = [facility, ...companions, ...overflow];
    const dayA: FacSpot[] = [{ ...p(33.59, 130.29), isBig: false }, { ...p(33.591, 130.291), isBig: false }, { ...p(33.592, 130.292), isBig: false }];
    const dayB: FacSpot[] = [{ ...p(33.4, 130.1), isBig: false }]; // 훨씬 먼 동네 — 그래도 dayA가 가득 차면 여기로 가야 한다

    const result = capAllDayFacilityDays([day, dayA, dayB], isFacility);

    expect(result.flat()).toHaveLength(day.length + dayA.length + dayB.length); // 개수 보존
    expect(result[0]).toEqual([facility]); // 시설 날짜는 이제 시설 하나뿐
    result.forEach((g) => expect(g.length).toBeLessThanOrEqual(6)); // 어떤 날도 6곳을 넘지 않는다
    expect(result[2].length).toBeGreaterThan(dayB.length); // dayA가 가득 차면 dayB도 받는다
  });

  it("evicts even a single close companion when there's one and nothing else to overflow", () => {
    const facility: FacSpot = { ...p(34.665, 135.433), isBig: true };
    const nearCompanion: FacSpot = { ...p(34.667, 135.44), isBig: false };
    const day = [facility, nearCompanion];
    const otherDay: FacSpot[] = [{ ...p(34.6, 135.5), isBig: false }];

    const result = capAllDayFacilityDays([day, otherDay], isFacility);

    expect(result[0]).toEqual([facility]);
    expect(result.flat()).toHaveLength(day.length + otherDay.length);
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

describe("reassignByCentroid — 캡·재균형 이후에도 소속이 안 맞으면 마지막에 바로잡는다 (작업지시서 2026-09-07 'PR #237 프로덕션 검증' §2)", () => {
  it("moves a misplaced stop to the day whose cluster is actually closer (도톤보리류 사례)", () => {
    // 우메다(day1) 4곳 + 실수로 딸려온 난바(도톤보리) 1곳, 난바(day3) 4곳.
    // 도톤보리는 day1보다 day3에 훨씬 가깝다.
    const day1 = [p(34.7, 135.49), p(34.701, 135.491), p(34.702, 135.492), p(34.703, 135.493), p(34.665, 135.501)];
    const day2 = [p(34.68, 135.5), p(34.681, 135.501), p(34.682, 135.502)];
    const day3 = [p(34.666, 135.502), p(34.667, 135.503), p(34.6665, 135.5015), p(34.6675, 135.5025)];

    const result = reassignByCentroid([day1, day2, day3], () => false);

    expect(result.flat()).toHaveLength(day1.length + day2.length + day3.length); // 개수 보존
    expect(result[0].some((s) => s.lat === 34.665)).toBe(false); // day1에서 빠진다
    expect(result[2].some((s) => s.lat === 34.665)).toBe(true); // day3으로 옮겨간다
  });

  it("never violates the 3-8 (or 2-3 for facility days) size guard while reassigning", () => {
    interface FacSpot extends P {
      isBig: boolean;
    }
    const isFacility = (s: FacSpot) => s.isBig;
    // day1(시설 날짜, 정확히 3곳=하한) 근처에 day2 스팟들이 잔뜩 있어도
    // day1에서 더 뺄 수 없어야 한다(하한 위반 방지).
    const day1: FacSpot[] = [{ ...p(34.665, 135.433), isBig: true }, { ...p(34.666, 135.434), isBig: false }, { ...p(34.667, 135.435), isBig: false }];
    const day2: FacSpot[] = Array.from({ length: 5 }, (_, i) => ({ ...p(34.6 + i * 0.001, 135.5 + i * 0.001), isBig: false }));

    const result = reassignByCentroid([day1, day2], isFacility);

    expect(result[0].length).toBeGreaterThanOrEqual(2); // 시설 날짜 하한(시설+1)
    expect(result[0].length).toBeLessThanOrEqual(3); // 시설 날짜 상한(시설+2)
    expect(result.flat()).toHaveLength(day1.length + day2.length);
  });

  it("returns groups unchanged when there is only one group", () => {
    const single = [[p(0, 0), p(1, 1)]];
    expect(reassignByCentroid(single, () => false)).toEqual(single);
  });
});

describe("dedupeByBrand — 코스 전체에서 같은 체인은 하나만 (작업지시서 2026-09-07 'PR #237 프로덕션 검증' §3)", () => {
  interface NamedSpot {
    name: string;
    rating?: number | null;
    reviewCount?: number | null;
  }

  it("collapses three branches of the same chain (모츠나베 라쿠텐치 case) into the one with the best rating×reviews, even far apart and across days", () => {
    const branch1: NamedSpot = { name: "모츠나베 라쿠텐치 이마이즈미 총본점", rating: 4.1, reviewCount: 500 };
    const branch2: NamedSpot = { name: "원조 모츠나베 라쿠텐치 텐진본점", rating: 4.3, reviewCount: 900 }; // 가장 높은 점수 — 이게 남아야 함
    const branch3: NamedSpot = { name: "원조모츠나베 라쿠텐치 니시나카스점", rating: 4.0, reviewCount: 300 }; // 텐진본점과 364m — 거리 조건 없이도 잡혀야 함

    const result = dedupeByBrand([branch1, branch2, branch3]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(branch2);
  });

  it("collapses branches whose word order differs (모토무라 규카츠 case, 작업지시서 2026-09-08 'PR #238 프로덕션 검증' §4)", () => {
    const a: NamedSpot = { name: "모토무라 규카츠", rating: 4.0, reviewCount: 400 };
    const b: NamedSpot = { name: "규카츠 모토무라 후쿠오카 파르코점", rating: 4.2, reviewCount: 800 }; // 지점 표기 제거 방식만으로는 어순이 달라 못 잡혔던 사례

    const result = dedupeByBrand([a, b]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(b);
  });

  it("keeps genuinely different brands untouched", () => {
    const a: NamedSpot = { name: "스시로 텐진점", rating: 4.2, reviewCount: 1000 };
    const b: NamedSpot = { name: "이치란 라멘 하카타점", rating: 4.4, reviewCount: 2000 };
    expect(dedupeByBrand([a, b])).toHaveLength(2);
  });
});

describe("medoidOf — 평균이 아니라 실제 스팟을 중심으로 (작업지시서 2026-09-08 'PR #238 프로덕션 검증' §3-2)", () => {
  it("returns the actual point, not an averaged one", () => {
    const points = [p(34.6, 135.5), p(34.601, 135.501), p(34.599, 135.499)];
    const result = medoidOf(points);
    expect(points).toContain(result); // 반드시 입력 중 하나(실제 스팟)여야 한다 — 평균 좌표가 아니다.
  });

  it("stays near the tight cluster even with a distant outlier (다자이후류 사례)", () => {
    // 하카타권 3곳(촘촘) + 다자이후(15km 밖) — medoid는 하카타 쪽에
    // 남아야 한다. centroid(평균)였다면 다자이후 쪽으로 상당히 끌려갔을 것이다.
    const hakata = [p(33.595, 130.42), p(33.596, 130.421), p(33.594, 130.419)];
    const dazaifu = p(33.47, 130.535);
    const result = medoidOf([...hakata, dazaifu]);
    expect(hakata).toContain(result); // 다자이후가 아니라 하카타권의 한 곳이어야 한다.
  });

  it("returns the single point unchanged when there's only one", () => {
    const only = p(1, 2);
    expect(medoidOf([only])).toBe(only);
  });
});

describe("chunkByProximity — 500m 이내로 이어지는 스팟은 하나의 소구역으로 (작업지시서 2026-09-08 'PR #238 프로덕션 검증' §3-1)", () => {
  it("merges a chain of stops within the link distance, even if the ends are far apart (A-B, B-C 각각 가까워도 A-C는 멀 수 있음)", () => {
    // A-B ~110m, B-C ~110m이지만 A-C는 ~220m — 전이적 연결로 셋 다 한 묶음이어야 한다.
    const a = p(34.6, 135.5);
    const b = p(34.601, 135.5);
    const c = p(34.602, 135.5);
    const chunks = chunkByProximity([a, b, c], 0.15);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(3);
  });

  it("keeps far-apart stops in separate chunks", () => {
    const a = p(34.6, 135.5);
    const b = p(34.7, 135.6); // 여러 km 떨어짐
    const chunks = chunkByProximity([a, b], 0.5);
    expect(chunks).toHaveLength(2);
  });

  it("returns one chunk per stop when nothing is within range", () => {
    const points = [p(0, 0), p(10, 10), p(20, 20)];
    expect(chunkByProximity(points, 0.5)).toHaveLength(3);
  });
});

/** courseBrief.ts의 reallocateStopsByDay가 요구하는 FinalStop 최소 형태를 채운 테스트 픽스처. */
function stop(id: string, lat: number, lng: number, extra: Partial<FinalStop> = {}): FinalStop {
  return {
    id,
    placeId: id,
    name: extra.name ?? id,
    category: extra.category ?? "tourist_attraction",
    color: "#000",
    icon: "pin",
    lat,
    lng,
    slotKey: "slot",
    slotLabel: "슬롯",
    hour: 10,
    meal: false,
    ...extra,
  };
}

function crossDayViolations(days: FinalStop[][], maxKm: number): number {
  let count = 0;
  for (let i = 0; i < days.length; i++) {
    for (let j = i + 1; j < days.length; j++) {
      for (const a of days[i]) {
        for (const b of days[j]) {
          if (haversineKm(a, b) <= maxKm) count++;
        }
      }
    }
  }
  return count;
}

/** base에서 동쪽/북쪽으로 각각 dEastM/dNorthM미터 이동한 좌표 — 테스트 픽스처를 "몇 미터 떨어졌는지"로 정확히 통제하기 위함(위경도 값을 눈대중으로 늘리면 dedupeByProximity의 100/300m 문턱을 실수로 건드리기 쉽다 — 실제로 처음 이 테스트를 이렇게 짰다가 걸렸다). */
function offset(base: P, dEastM: number, dNorthM: number): P {
  return {
    lat: base.lat + dNorthM / 111_000,
    lng: base.lng + dEastM / (111_000 * Math.cos((base.lat * Math.PI) / 180)),
  };
}

/** 카테고리를 스팟마다 돌아가며 다르게 줘, dedupeByProximity의 "100~300m + 같은 카테고리" 소프트 문턱에 테스트 픽스처끼리 우연히 걸리지 않게 한다. */
const CATEGORY_CYCLE = ["tourist_attraction", "restaurant", "cafe", "museum"];
function categoryFor(index: number): string {
  return CATEGORY_CYCLE[index % CATEGORY_CYCLE.length];
}

/**
 * base를 중심으로 spacing미터 간격의 격자에 count개 스팟을 배치한다 —
 * 서로 dedupeByProximity(최대 300m)보다 멀면서, chunkByProximity의
 * 500m 체인 문턱도 넘어(그리드 인접 칸 간격을 700m로 잡아 대각선을
 * 포함한 모든 쌍이 500m를 넘도록) 클러스터 하나가 통째로 한 소구역
 * 으로 묶여버리지 않게 한다 — 그러면서도 "하루에 돌 만한 한 구역"으로
 * 보일 만큼은 뭉쳐 있다(3×2 격자 기준 전체 폭 약 1.4km).
 * 처음엔 450m 간격으로 짰다가, 그 경우 그리드 전체가 체인으로 이어져
 * 클러스터 하나가 통째로 하나의 청크가 돼버리는 걸 겪었다(작업지시서가
 * 요구하는 전이적 병합 자체는 올바른 동작 — 이 테스트 픽스처가
 * 비현실적으로 조밀했던 것).
 */
function cluster(idPrefix: string, base: P, count: number, spacingM = 700): FinalStop[] {
  return Array.from({ length: count }, (_, i) =>
    stop(`${idPrefix}${i}`, offset(base, (i % 3) * spacingM, Math.floor(i / 3) * spacingM).lat, offset(base, (i % 3) * spacingM, Math.floor(i / 3) * spacingM).lng, {
      category: categoryFor(i),
    }),
  );
}

describe("reallocateStopsByDay — 전체 파이프라인 통합 (작업지시서 2026-09-08 'PR #238 프로덕션 검증')", () => {
  it("keeps a chain-linked micro-region together across the full pipeline (도톤보리류 사례가 실제로 해소되는지)", () => {
    const umedaBase = p(34.7, 135.49);
    const nambaBase = p(34.665, 135.5);
    const tennojiBase = p(34.647, 135.514);

    // 우메다권 5곳(day1 생성 결과) + "도톤보리"(실제로는 난바권인데
    // day1에 잘못 섞여 들어옴). 도톤보리는 난바 스팟 하나와 200m —
    // dedupeByProximity 하드 문턱(100m)은 넘고 소구역 묶음 문턱(500m)
    // 안쪽이라, 중복 제거되진 않으면서 같은 청크로는 묶여야 한다.
    const umedaCore = cluster("umeda", umedaBase, 5);
    const dotonboriPos = offset(nambaBase, 0, 0);
    // namba0(카테고리 순환의 첫 값 "tourist_attraction")와 200m라
    // dedupeByProximity의 소프트 문턱(100~300m + 같은 카테고리)에 걸리지
    // 않도록 일부러 다른 카테고리를 준다 — 실제로 다른 방문 목적(전망대
    // vs 식당류)이라고 보는 게 자연스럽기도 하다.
    const dotonbori = stop("dotonbori", dotonboriPos.lat, dotonboriPos.lng, { name: "도톤보리", category: "restaurant" });
    const umeda = [...umedaCore, dotonbori];

    const namba = cluster("namba", offset(nambaBase, 200, 0), 6); // 200m 옆에서 시작 — namba0가 도톤보리와 200m
    const tennoji = cluster("ten", tennojiBase, 6);

    const result = reallocateStopsByDay([umeda, namba, tennoji]);

    expect(result).toHaveLength(3);
    expect(result.flat()).toHaveLength(umeda.length + namba.length + tennoji.length); // 개수 보존
    // 도톤보리가 난바권 스팟이 있는 날에 있어야 한다(우메다 전용 날이 아니라).
    const dotonboriDay = result.find((g) => g.some((s) => s.id === "dotonbori"));
    expect(dotonboriDay?.some((s) => s.id === "namba0")).toBe(true);
    // 날짜 간 500m 이내 쌍이 없어야 한다.
    expect(crossDayViolations(result, 0.5)).toBe(0);
    // 하루 스팟 수 3~7곳 — 도톤보리·namba0 청크(2곳)가 나머지 난바 5곳과
    // 한 날에 묶이면 7곳이 된다. 작업지시서 2026-09-08 "PR #239 프로덕션
    // 검증" §3: 청크를 쪼개는 것보다 하루 상한을 7까지 허용하는 쪽이 낫다.
    result.forEach((g) => {
      expect(g.length).toBeGreaterThanOrEqual(3);
      expect(g.length).toBeLessThanOrEqual(7);
    });
  });

  it("keeps an all-day facility's day to exactly the facility (시설 단독) and everything else within the 3-7 size guard", () => {
    const facility = stop("usj", 34.665, 135.433, { category: "amusement_park", name: "유니버설 스튜디오 재팬" });
    const day1: FinalStop[] = [facility, ...cluster("d1", p(34.7, 135.49), 5)];
    const day2: FinalStop[] = cluster("d2", p(34.665, 135.501), 6);
    const day3: FinalStop[] = cluster("d3", p(34.647, 135.514), 6);

    const result = reallocateStopsByDay([day1, day2, day3]);

    // 시설 날(1곳, 작업지시서 2026-09-08 "PR #239 프로덕션 검증" §2 —
    // 시설 날은 시설만) + 나머지 2일(각 최대 6곳) = 13곳 그릇보다 입력이
    // 많다(18곳). 그릇을 넘는 5곳은 평점×리뷰수(여기선 전부 미설정=0으로
    // 동률)가 낮은 순으로 빠진다.
    expect(result.flat()).toHaveLength(13);
    const facilityDay = result.find((g) => g.some((s) => s.id === "usj"));
    expect(facilityDay).toBeDefined();
    expect(facilityDay).toHaveLength(1); // 시설 단독 — 동반 스팟 없음
    result
      .filter((g) => g !== facilityDay)
      .forEach((g) => {
        expect(g.length).toBeGreaterThanOrEqual(3);
        expect(g.length).toBeLessThanOrEqual(7);
      });
  });

  it("trims the lowest rating×reviewCount stops when the total exceeds the day-count's 상한 그릇 (작업지시서 2026-09-08 'PR #238 프로덕션 검증' §2)", () => {
    const day1 = cluster("a", p(34.7, 135.49), 6).map((s) => ({ ...s, rating: 4.5, reviewCount: 500 }));
    const day2 = cluster("b", p(34.665, 135.501), 6).map((s) => ({ ...s, rating: 4.5, reviewCount: 500 }));
    // c0·c1만 평점·리뷰수가 낮다 — 시설 없이 3일 × 상한 6곳 = 18곳 그릇에서
    // 20곳 중 이 둘이 잘려야 한다.
    const day3 = cluster("c", p(34.647, 135.514), 8).map((s, i) => ({ ...s, rating: i < 2 ? 3.0 : 4.5, reviewCount: i < 2 ? 10 : 500 }));

    const result = reallocateStopsByDay([day1, day2, day3]);

    expect(result.flat()).toHaveLength(18);
    const survivingIds = new Set(result.flat().map((s) => s.id));
    expect(survivingIds.has("c0")).toBe(false);
    expect(survivingIds.has("c1")).toBe(false);
  });

  it("regression: a plain 2-day course (no facility) stays free of cross-day 500m violations under the new 6-stop cap", () => {
    const day1: FinalStop[] = cluster("a", p(34.6, 135.5), 4);
    const day2: FinalStop[] = cluster("b", p(34.68, 135.55), 6);

    const result = reallocateStopsByDay([day1, day2]);

    expect(result.flat()).toHaveLength(day1.length + day2.length);
    expect(crossDayViolations(result, 0.5)).toBe(0);
    result.forEach((g) => {
      expect(g.length).toBeGreaterThanOrEqual(3);
      expect(g.length).toBeLessThanOrEqual(6);
    });
  });
});

// 작업지시서 2026-09-08 "이동 거리·시간이 직선거리입니다" — totalDistanceKm/
// toNextMinutes가 하버사인 직선거리 ÷ 고정 속도였던 문제(사량도처럼 배로만
// 갈 수 있는 섬도 "차로 51분"이라고 단언)를 실제 경로 조회로 고쳤는지 확인한다.

interface NamedPoint extends P {
  name: string;
}
function named(name: string, lat: number, lng: number): NamedPoint {
  return { name, lat, lng };
}

function fakeRoute(distanceKm: number, durationMinutes: number, mode: RouteResult["mode"] = "car"): RouteResult {
  return { distanceKm, durationMinutes, mode, mapPath: "color:0x0000ffcc|weight:3|0,0|1,1", points: null };
}

describe("planRouteForDay — 실제 경로 검증으로 스톱을 잇는다(fetch를 몰라도 되는 순수 로직)", () => {
  it("drops the day's own start stop (not the candidate) when the very first segment has no route (사량도류 섬 사례)", async () => {
    // 사량도(이 날의 첫 스톱)에서 나가는 첫 구간이 막히면, 아직 아무것도
    // 검증된 적 없는 시작점 쪽을 버리고 후보를 새 시작점으로 삼는다 —
    // 후보(중앙활어시장)를 버리면 반대로 "섬이 코스에 남고 육지가
    // 빠지는" 잘못된 결과가 된다.
    const stops = [named("사량도", 34.83, 128.32), named("중앙활어시장", 34.84, 128.42), named("심가네해물짬뽕", 34.845, 128.425)];
    let call = 0;
    const result = await planRouteForDay(stops, async () => {
      call++;
      return call === 1 ? "no-route" : fakeRoute(1, 5);
    });
    expect(result.stops.map((s) => s.name)).toEqual(["중앙활어시장", "심가네해물짬뽕"]);
    expect(result.segments).toHaveLength(1);
  });

  it("drops the candidate (not the already-validated predecessor) when a mid-list segment has no route", async () => {
    const stops = [named("a", 0, 0), named("b", 0, 1), named("c", 0, 2), named("d", 0, 3)];
    const result = await planRouteForDay(stops, async (last, candidate) => {
      // b → c 구간만 막힌다 — a→b는 이미 검증됐으니 c를 버리고 b→d를 이어본다.
      if (last.name === "b" && candidate.name === "c") return "no-route";
      return fakeRoute(1, 5);
    });
    expect(result.stops.map((s) => s.name)).toEqual(["a", "b", "d"]);
    expect(result.segments).toHaveLength(2);
  });

  it("keeps every stop when every segment has a route", async () => {
    const stops = [named("a", 0, 0), named("b", 0, 1), named("c", 0, 2)];
    const result = await planRouteForDay(stops, async () => fakeRoute(2, 10));
    expect(result.stops).toHaveLength(3);
    expect(result.segments).toHaveLength(2);
  });

  it("is a no-op for a single-stop day (no segment to test)", async () => {
    const stops = [named("a", 0, 0)];
    const result = await planRouteForDay(stops, async () => "no-route");
    expect(result.stops).toEqual(stops);
    expect(result.segments).toEqual([]);
  });
});

describe("applyDurationCap — 작업지시서 §3 ★ '소요시간이 비정상적으로 큼(3시간 초과)'", () => {
  it("keeps a measurement at or under 180 minutes, attaching the travel mode", () => {
    const result = applyDurationCap({ distanceKm: 5, durationMinutes: 180, mapPath: "x", points: null }, "car");
    expect(result).not.toBe("no-route");
    expect(result).toMatchObject({ distanceKm: 5, durationMinutes: 180, mode: "car" });
  });

  it("returns no-route once duration exceeds 180 minutes", () => {
    expect(applyDurationCap({ distanceKm: 50, durationMinutes: 181, mapPath: "x", points: null }, "car")).toBe("no-route");
  });
});

describe("straightRouteMeasurement/simplifyPath/mapPathParam — 정적 지도·직선 폴백 헬퍼", () => {
  it("estimates distance from the haversine straight line, not a fixed speed that happens to divide evenly", () => {
    const a = { lat: 34.83, lng: 128.32 };
    const b = { lat: 34.9, lng: 128.5 };
    const walk = straightRouteMeasurement(a, b, "walk");
    const car = straightRouteMeasurement(a, b, "car");
    expect(walk.distanceKm).toBeCloseTo(haversineKm(a, b), 5);
    // walk/car 속도가 "고정값으로 딱 떨어지는" 상황(작업지시서 §5 테스트
    // 고정 항목)을 재현하지 않는다 — 이건 haversineKm의 실제 소수점
    // 거리를 그대로 쓰므로 사람이 낸 딱 떨어지는 숫자가 아니다.
    expect(Number.isInteger(walk.distanceKm)).toBe(false);
    expect(car.durationMinutes).toBeLessThan(walk.durationMinutes); // 같은 거리라도 차가 더 빠르다
  });

  it("keeps a short path unchanged", () => {
    const points = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
    expect(simplifyPath(points)).toEqual(points);
  });

  it("samples a long path down to the point cap, keeping the first and last point", () => {
    const points = Array.from({ length: 500 }, (_, i) => ({ lat: 0, lng: i * 0.001 }));
    const sampled = simplifyPath(points);
    expect(sampled.length).toBeLessThanOrEqual(60);
    expect(sampled[0]).toEqual(points[0]);
    expect(sampled[sampled.length - 1]).toEqual(points[points.length - 1]);
  });

  it("formats a Static Maps path= value with color/weight and pipe-separated coordinates", () => {
    const value = mapPathParam([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]);
    expect(value).toBe("color:0x0000ffcc|weight:3|1,2|3,4");
  });
});

describe("fetchKakaoDrivingRoute — 카카오모빌리티 길찾기(국내 자동차)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns null when the API key isn't configured (판단 보류, 스팟 유지)", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "");
    expect(await fetchKakaoDrivingRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 })).toBeNull();
  });

  it("parses a successful response into distanceKm/durationMinutes ≥ the straight-line distance, and a path from the road vertexes", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
    const a = { lat: 34.83, lng: 128.32 }; // 사량도 근방
    const b = { lat: 34.84, lng: 128.42 }; // 중앙활어시장 근방
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          routes: [
            {
              result_code: 0,
              summary: { distance: 21050, duration: 51 * 60 }, // 실측(작업지시서 §2) — 21.05km/51분
              sections: [{ roads: [{ vertexes: [a.lng, a.lat, 128.37, 34.835, b.lng, b.lat] }] }],
            },
          ],
        }),
      }),
    );
    const result = await fetchKakaoDrivingRoute(a, b);
    expect(result).not.toBe("no-route");
    expect(result).not.toBeNull();
    const measurement = result as Exclude<typeof result, "no-route" | null>;
    expect(measurement.distanceKm).toBeCloseTo(21.05, 5);
    expect(measurement.durationMinutes).toBe(51);
    expect(measurement.distanceKm).toBeGreaterThanOrEqual(haversineKm(a, b)); // 도로가 직선보다 짧을 수 없다
    expect(measurement.mapPath).toContain("34.835,128.37"); // 중간 vertex(위도,경도 순서로 뒤집힘)가 경로에 반영됨
  });

  it("returns \"no-route\" when Kakao confirms there's no drivable route (result_code 1/2 — 사량도 같은 섬)", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [{ result_code: 1 }] }) }),
    );
    expect(await fetchKakaoDrivingRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 })).toBe("no-route");
  });

  it("returns null (not no-route) for a non-route-related result_code (param error 등 — 이 장소 판단이 아님)", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [{ result_code: 101 }] }) }),
    );
    expect(await fetchKakaoDrivingRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 })).toBeNull();
  });

  it("returns null on a network error instead of throwing (판단 보류)", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await fetchKakaoDrivingRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 })).toBeNull();
  });
});

describe("fetchGoogleDirectionsRoute — Google Directions(해외)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns null when the server key isn't configured", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "");
    expect(await fetchGoogleDirectionsRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, "driving")).toBeNull();
  });

  it("parses a successful response and passes the overview_polyline straight through as an enc: path", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "OK",
          routes: [{ legs: [{ distance: { value: 5000 }, duration: { value: 900 } }], overview_polyline: { points: "abc123" } }],
        }),
      }),
    );
    const result = await fetchGoogleDirectionsRoute({ lat: 0, lng: 0 }, { lat: 0.05, lng: 0.05 }, "driving");
    expect(result).toMatchObject({ distanceKm: 5, durationMinutes: 15, mapPath: "color:0x0000ffcc|weight:3|enc:abc123" });
  });

  it("returns \"no-route\" on ZERO_RESULTS", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ZERO_RESULTS" }) }));
    expect(await fetchGoogleDirectionsRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, "walking")).toBe("no-route");
  });

  it("returns null (not no-route) on REQUEST_DENIED — key/permission 문제는 이 장소 판단이 아니다", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "REQUEST_DENIED" }) }));
    expect(await fetchGoogleDirectionsRoute({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, "driving")).toBeNull();
  });
});

describe("fetchLegRoute — /api/routes가 그대로 노출하는 계획 탭용 구간 조회", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // 본토 박스(regionForCoords.ts) 안 — 국내로 분류된다.
  const domesticNear = { lat: 34.83, lng: 128.321 }; // ~100m 이내
  const domesticFar = { lat: 34.83, lng: 128.32 };
  const domesticFarB = { lat: 34.84, lng: 128.42 }; // ~10km — 도보 구간 아님
  // 오사카 — 한국 박스 밖이라 해외로 분류된다.
  const overseasA = { lat: 34.6937, lng: 135.5023 };
  const overseasB = { lat: 34.66, lng: 135.43 };

  it("skips the API call entirely for a short (<1km) domestic leg — 도보 구간은 실경로 조회 대상이 아니다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLegRoute(domesticNear, { lat: domesticNear.lat, lng: domesticNear.lng + 0.0005 });
    expect(result).toEqual({ distanceM: null, durationMin: null, path: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns real distance/duration/path for a domestic leg via Kakao", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          routes: [
            {
              result_code: 0,
              summary: { distance: 21050, duration: 51 * 60 },
              sections: [{ roads: [{ vertexes: [domesticFar.lng, domesticFar.lat, domesticFarB.lng, domesticFarB.lat] }] }],
            },
          ],
        }),
      }),
    );
    const result = await fetchLegRoute(domesticFar, domesticFarB);
    expect(result.distanceM).toBe(21050);
    expect(result.durationMin).toBe(51);
    expect(result.path).not.toBeNull();
    expect(result.path?.[0]).toEqual({ lat: domesticFar.lat, lng: domesticFar.lng });
  });

  it("returns NO_ROUTE (not a straight-line estimate) when Kakao confirms no route exists — 계획 탭은 추정치를 진짜처럼 보여주면 안 된다", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [{ result_code: 1 }] }) }));
    expect(await fetchLegRoute(domesticFar, domesticFarB)).toEqual({ distanceM: null, durationMin: null, path: null });
  });

  it("returns NO_ROUTE (not a straight-line estimate) when the lookup is inconclusive (no key/network failure)", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "");
    expect(await fetchLegRoute(domesticFar, domesticFarB)).toEqual({ distanceM: null, durationMin: null, path: null });
  });

  it("returns real distance/duration/decoded path for an overseas leg via Google Directions", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "OK",
          routes: [{ legs: [{ distance: { value: 5000 }, duration: { value: 900 } }], overview_polyline: { points: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" } }],
        }),
      }),
    );
    const result = await fetchLegRoute(overseasA, overseasB);
    expect(result.distanceM).toBe(5000);
    expect(result.durationMin).toBe(15);
    expect(result.path?.[0].lat).toBeCloseTo(38.5, 5);
  });

  it("returns NO_ROUTE once the segment exceeds the 3-hour cap (§3 ★)", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ routes: [{ result_code: 0, summary: { distance: 300000, duration: 200 * 60 }, sections: [] }] }),
      }),
    );
    expect(await fetchLegRoute(domesticFar, domesticFarB)).toEqual({ distanceM: null, durationMin: null, path: null });
  });
});
