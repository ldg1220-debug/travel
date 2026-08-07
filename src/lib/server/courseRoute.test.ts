import { describe, expect, it } from "vitest";
import {
  assembleRoute,
  assembleRouteWithEscalation,
  dedupePoolsByBrand,
  haversineKm,
  resolveDuplicatePicks,
  rerollSlot,
  type RouteCandidate,
  type SlotPool,
} from "./courseRoute";

function cand(id: string, lat: number, lng: number, taste: number): RouteCandidate {
  return { id, name: id, lat, lng, taste };
}

describe("haversineKm", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineKm({ lat: 37.5665, lng: 126.978 }, { lat: 37.5665, lng: 126.978 })).toBe(0);
  });

  it("roughly matches the known Seoul-Busan distance (~325km)", () => {
    const km = haversineKm({ lat: 37.5665, lng: 126.978 }, { lat: 35.1796, lng: 129.0756 });
    expect(km).toBeGreaterThan(300);
    expect(km).toBeLessThan(350);
  });
});

describe("assembleRoute", () => {
  it("returns an empty map when every slot is empty", () => {
    expect(assembleRoute([{ slotKey: "a", candidates: [] }], null, false)).toEqual(new Map());
  });

  it("picks the single candidate for a one-slot pool", () => {
    const pools: SlotPool[] = [{ slotKey: "a", candidates: [cand("x", 37.5, 127, 9)] }];
    const picked = assembleRoute(pools, null, false);
    expect(picked?.get("a")?.id).toBe("x");
  });

  it("prefers the globally best combo, not just each slot's own top taste, when a nearby-but-lower-taste option keeps the whole route tighter", () => {
    // Slot A: only one option, anchored at (37.50, 127.00).
    // Slot B: "far-high" (taste 10, ~11km away) vs "near-ok" (taste 9, ~1km away).
    // The ~11km detour costs far more than 1 taste point at the 0.35/km penalty scale used throughout the app, so the DP should take near-ok.
    const pools: SlotPool[] = [
      { slotKey: "a", candidates: [cand("anchor", 37.5, 127.0, 5)] },
      {
        slotKey: "b",
        candidates: [cand("far-high", 37.6, 127.0, 10), cand("near-ok", 37.51, 127.0, 9)],
      },
    ];
    const picked = assembleRoute(pools, null, false);
    expect(picked?.get("b")?.id).toBe("near-ok");
  });

  it("returns null when the radius constraint makes every path infeasible", () => {
    const pools: SlotPool[] = [
      { slotKey: "a", candidates: [cand("x", 37.5, 127.0, 5)] },
      { slotKey: "b", candidates: [cand("y", 40.0, 130.0, 10)] }, // hundreds of km away
    ];
    expect(assembleRoute(pools, 5, false)).toBeNull();
  });

  it("skips a slot whose candidate list is empty instead of failing the whole route", () => {
    const pools: SlotPool[] = [
      { slotKey: "a", candidates: [cand("x", 37.5, 127.0, 5)] },
      { slotKey: "b", candidates: [] },
      { slotKey: "c", candidates: [cand("z", 37.5, 127.0, 5)] },
    ];
    const picked = assembleRoute(pools, null, false);
    expect(picked?.has("b")).toBe(false);
    expect(picked?.get("a")?.id).toBe("x");
    expect(picked?.get("c")?.id).toBe("z");
  });

  it("without jitter, the same input always produces the same picks (regeneration-with-jitter relies on this being otherwise deterministic)", () => {
    const pools: SlotPool[] = [
      { slotKey: "a", candidates: [cand("x1", 37.5, 127.0, 5), cand("x2", 37.51, 127.0, 4)] },
      { slotKey: "b", candidates: [cand("y1", 37.5, 127.0, 6), cand("y2", 37.6, 127.0, 9)] },
    ];
    const first = assembleRoute(pools, null, false);
    const second = assembleRoute(pools, null, false);
    expect([...first!.entries()]).toEqual([...second!.entries()]);
  });
});

describe("assembleRouteWithEscalation", () => {
  it("escalates to a wider radius step when the tighter one is infeasible", () => {
    const pools: SlotPool[] = [
      { slotKey: "a", candidates: [cand("x", 37.5, 127.0, 5)] },
      { slotKey: "b", candidates: [cand("y", 37.7, 127.0, 5)] }, // ~22km away
    ];
    const result = assembleRouteWithEscalation(pools, [5, 30, null], 0, false);
    expect(result?.usedStep).toBe(1);
    expect(result?.picked.get("b")?.id).toBe("y");
  });

  it("returns null when even the most permissive step fails", () => {
    // radiusStepsKm never includes null here, and no combo is close enough.
    const pools: SlotPool[] = [
      { slotKey: "a", candidates: [cand("x", 0, 0, 5)] },
      { slotKey: "b", candidates: [cand("y", 50, 50, 5)] },
    ];
    expect(assembleRouteWithEscalation(pools, [5, 10], 0, false)).toBeNull();
  });
});

describe("rerollSlot", () => {
  const prev = cand("prev", 37.5, 127.0, 0);
  const next = cand("next", 37.5, 127.02, 0);

  it("excludes ids already shown", () => {
    const pool: SlotPool = { slotKey: "a", candidates: [cand("a1", 37.5, 127.0, 9), cand("a2", 37.5, 127.0, 5)] };
    const result = rerollSlot(pool, { excludeIds: new Set(["a1"]), radiusKm: null });
    expect(result?.id).toBe("a2");
  });

  it("returns null once every candidate is excluded", () => {
    const pool: SlotPool = { slotKey: "a", candidates: [cand("a1", 37.5, 127.0, 9)] };
    expect(rerollSlot(pool, { excludeIds: new Set(["a1"]), radiusKm: null })).toBeNull();
  });

  it("weighs both the previous and next confirmed neighbor's distance, not just one", () => {
    const pool: SlotPool = {
      slotKey: "a",
      candidates: [
        // Behind prev, i.e. away from next — same distance-to-prev magnitude
        // as "balanced" below, but adds instead of cancels against the
        // distance to next (0.01° behind prev + the full 0.02° gap to next).
        cand("wrongDirection", 37.5, 126.99, 8),
        // On the straight line between prev and next — minimizes the SUM of
        // both distances (triangle-inequality equality case).
        cand("balanced", 37.5, 127.01, 8),
      ],
    };
    const result = rerollSlot(pool, { prev, next, excludeIds: new Set(), radiusKm: null });
    expect(result?.id).toBe("balanced");
  });

  it("honors the radius constraint against both neighbors", () => {
    const pool: SlotPool = { slotKey: "a", candidates: [cand("tooFar", 38.0, 127.0, 9)] };
    expect(rerollSlot(pool, { prev, next, excludeIds: new Set(), radiusKm: 5 })).toBeNull();
  });
});

describe("dedupePoolsByBrand", () => {
  const sameShop = (a: string, b: string) => a === b;

  it("assigns a duplicate to whichever slot scored it higher when the loser slot has other candidates left over", () => {
    const pools: SlotPool[] = [
      { slotKey: "lunch", candidates: [cand("우오신 우메다점", 34.7, 135.5, 6), cand("다른집", 34.7, 135.5, 5)] },
      { slotKey: "dinner", candidates: [cand("우오신 우메다점", 34.7, 135.5, 9)] },
    ];
    const result = dedupePoolsByBrand(pools, sameShop);
    expect(result.find((p) => p.slotKey === "lunch")?.candidates.map((c) => c.id)).toEqual(["다른집"]);
    expect(result.find((p) => p.slotKey === "dinner")?.candidates).toHaveLength(1);
  });

  it("never fully empties a slot that started with candidates, even if every one of them loses to a duplicate elsewhere — a vanished slot (e.g. lunch/dinner both searching the same '맛집' keyword and returning identical results) is worse than an occasional repeated place", () => {
    const pools: SlotPool[] = [
      { slotKey: "lunch", candidates: [cand("우오신 우메다점", 34.7, 135.5, 6)] },
      { slotKey: "dinner", candidates: [cand("우오신 우메다점", 34.7, 135.5, 9)] },
    ];
    const result = dedupePoolsByBrand(pools, sameShop);
    // lunch's only candidate lost the dedup entirely (dinner scored it
    // higher), but lunch must still surface *something* rather than vanish.
    expect(result.find((p) => p.slotKey === "lunch")?.candidates).toHaveLength(1);
    expect(result.find((p) => p.slotKey === "dinner")?.candidates).toHaveLength(1);
  });

  it("restores each emptied slot's own best candidate (own taste score), not a copy of the slot that won the duplicates", () => {
    const pools: SlotPool[] = [
      { slotKey: "am-sight", candidates: [cand("경복궁", 37.58, 126.98, 7), cand("남산타워", 37.55, 126.99, 6)] },
      { slotKey: "pm-sight", candidates: [cand("경복궁", 37.58, 126.98, 9), cand("남산타워", 37.55, 126.99, 8)] },
    ];
    const result = dedupePoolsByBrand(pools, sameShop);
    // pm-sight outscores am-sight on both shared names, so am-sight loses
    // everything to the dedup pass and must fall back to its own highest-
    // taste candidate (경복궁 @ 7 — its own score, not pm-sight's 9).
    const amSight = result.find((p) => p.slotKey === "am-sight")!.candidates;
    expect(amSight).toHaveLength(1);
    expect(amSight[0].id).toBe("경복궁");
    expect(amSight[0].taste).toBe(7);
    expect(result.find((p) => p.slotKey === "pm-sight")?.candidates).toHaveLength(2);
  });

  it("leaves distinct names untouched", () => {
    const pools: SlotPool[] = [
      { slotKey: "lunch", candidates: [cand("경복궁", 37.58, 126.98, 6)] },
      { slotKey: "dinner", candidates: [cand("광장시장", 37.57, 127.0, 7)] },
    ];
    const result = dedupePoolsByBrand(pools, sameShop);
    expect(result.find((p) => p.slotKey === "lunch")?.candidates).toHaveLength(1);
    expect(result.find((p) => p.slotKey === "dinner")?.candidates).toHaveLength(1);
  });
});

describe("resolveDuplicatePicks", () => {
  const sameShop = (a: string, b: string) => a === b;
  const order = ["lunch", "dinner"];

  it("leaves picks untouched when nothing collides", () => {
    const picked = new Map<string, RouteCandidate>([
      ["lunch", cand("우오신", 34.7, 135.5, 6)],
      ["dinner", cand("규카츠 모토무라", 34.7, 135.5, 7)],
    ]);
    const result = resolveDuplicatePicks(order, picked, [], () => [], sameShop);
    expect(result.get("lunch")?.id).toBe("우오신");
    expect(result.get("dinner")?.id).toBe("규카츠 모토무라");
  });

  it("swaps the later slot's pick for a distinct candidate still in its own shortlist", () => {
    // dedupePoolsByBrand's own-slot-restore safety net handed dinner the
    // exact same place lunch already confirmed — its shortlist has another option.
    const picked = new Map<string, RouteCandidate>([
      ["lunch", cand("우오신", 34.7, 135.5, 6)],
      ["dinner", cand("우오신", 34.7, 135.5, 6)],
    ]);
    const pools: SlotPool[] = [{ slotKey: "dinner", candidates: [cand("우오신", 34.7, 135.5, 6), cand("규카츠 모토무라", 34.7, 135.5, 5)] }];
    const result = resolveDuplicatePicks(order, picked, pools, () => [], sameShop);
    expect(result.get("lunch")?.id).toBe("우오신");
    expect(result.get("dinner")?.id).toBe("규카츠 모토무라");
  });

  it("falls back to the slot's full raw pool when its shortlist has no distinct option left (real case: lunch/dinner both searched the identical '맛집' keyword)", () => {
    const picked = new Map<string, RouteCandidate>([
      ["lunch", cand("우오신", 34.7, 135.5, 6)],
      ["dinner", cand("우오신", 34.7, 135.5, 6)],
    ]);
    // dinner's shortlist only ever had this one (identical) candidate.
    const pools: SlotPool[] = [{ slotKey: "dinner", candidates: [cand("우오신", 34.7, 135.5, 6)] }];
    const rawPoolFor = (slotKey: string) => (slotKey === "dinner" ? [cand("우오신", 34.7, 135.5, 6), cand("규카츠 모토무라", 34.7, 135.5, 4)] : []);
    const result = resolveDuplicatePicks(order, picked, pools, rawPoolFor, sameShop);
    expect(result.get("dinner")?.id).toBe("규카츠 모토무라");
  });

  it("drops the later slot entirely when truly nothing distinct is left anywhere, rather than showing the duplicate", () => {
    const picked = new Map<string, RouteCandidate>([
      ["lunch", cand("우오신", 34.7, 135.5, 6)],
      ["dinner", cand("우오신", 34.7, 135.5, 6)],
    ]);
    const pools: SlotPool[] = [{ slotKey: "dinner", candidates: [cand("우오신", 34.7, 135.5, 6)] }];
    const result = resolveDuplicatePicks(order, picked, pools, () => [], sameShop);
    expect(result.has("dinner")).toBe(false);
    expect(result.get("lunch")?.id).toBe("우오신");
  });

  it("chains correctly across 3+ slots — a third slot must also avoid whatever the (now-swapped) second slot ended up with", () => {
    const threeOrder = ["a", "b", "c"];
    const picked = new Map<string, RouteCandidate>([
      ["a", cand("X", 0, 0, 9)],
      ["b", cand("X", 0, 0, 9)], // collides with a, will swap to Y
      ["c", cand("Y", 0, 0, 9)], // would then collide with b's swapped-in Y
    ]);
    const pools: SlotPool[] = [
      { slotKey: "b", candidates: [cand("X", 0, 0, 9), cand("Y", 0, 0, 8)] },
      { slotKey: "c", candidates: [cand("Y", 0, 0, 9), cand("Z", 0, 0, 3)] },
    ];
    const result = resolveDuplicatePicks(threeOrder, picked, pools, () => [], sameShop);
    expect(result.get("a")?.id).toBe("X");
    expect(result.get("b")?.id).toBe("Y");
    expect(result.get("c")?.id).toBe("Z");
  });
});

// ── 시작·종료 위치 고정(DP 앵커) ─────────────────────────────────────
//
// courseRoute.ts 자체는 이 기능을 위해 전혀 수정하지 않았다 — 후보가
// 정확히 1개뿐인 레이어를 pools 배열 맨 앞/뒤에 끼워 넣으면, 기존
// 인접-레이어 이동 페널티 로직만으로 이미 "그 지점을 반드시 거침" 제약이
// 된다(courseRecommendV2.ts가 실제로 이렇게 조립한다). 여기선 그 조립
// 방식을 assembleRoute에 직접 적용해 검증한다.
describe("assembleRoute — start/end anchors (synthetic single-candidate boundary layers)", () => {
  it("pins only the start when no end anchor is given (open point-to-point route)", () => {
    const pools: SlotPool[] = [
      { slotKey: "__start__", candidates: [cand("start", 37.5, 127.0, 0)] },
      { slotKey: "sight", candidates: [cand("far-high", 37.62, 127.02, 10), cand("near-ok", 37.505, 127.005, 9)] },
    ];
    const picked = assembleRoute(pools, null, false);
    expect(picked?.get("__start__")?.id).toBe("start");
    // 앵커에서 가까운 쪽이, 취향점수가 더 높아도 거리 페널티 때문에 진다 —
    // courseRoute.ts의 기존 "prefers globally best combo" 테스트와 같은 이치.
    expect(picked?.get("sight")?.id).toBe("near-ok");
  });

  it("pins both start and end, doubling the pull toward whichever candidate is close to the anchor point", () => {
    const pools: SlotPool[] = [
      { slotKey: "__start__", candidates: [cand("start", 37.5, 127.0, 0)] },
      { slotKey: "sight", candidates: [cand("far-high", 37.62, 127.02, 10), cand("near-ok", 37.505, 127.005, 9)] },
      { slotKey: "__end__", candidates: [cand("end", 37.5, 127.0, 0)] },
    ];
    const picked = assembleRoute(pools, null, false);
    expect(picked?.get("__start__")?.id).toBe("start");
    expect(picked?.get("__end__")?.id).toBe("end");
    expect(picked?.get("sight")?.id).toBe("near-ok");
  });

  it("handles a circular route (start and end anchors at the same coordinates, e.g. '숙소로 복귀') via the same adjacent-layer penalty — no special-cased circular-route code needed", () => {
    const lodging = { lat: 37.5, lng: 127.0 };
    const pools: SlotPool[] = [
      { slotKey: "__start__", candidates: [cand("lodging", lodging.lat, lodging.lng, 0)] },
      { slotKey: "sight", candidates: [cand("far-high", 37.62, 127.02, 10), cand("near-ok", 37.505, 127.005, 9)] },
      { slotKey: "__end__", candidates: [cand("lodging", lodging.lat, lodging.lng, 0)] },
    ];
    const picked = assembleRoute(pools, null, false);
    // 왕복(숙소→명소→숙소)이라 편도 페널티의 두 배가 걸린다 — far-high는
    // km당 0.35 페널티가 4점 캡에 걸려 두 구간 다 캡 상한(총 8점 감점)이라
    // near-ok(왕복 페널티 총 ~0.5점)가 취향점수 차이(10 vs 9)를 훨씬 넘어
    // 큰 격차로 이긴다.
    expect(picked?.get("sight")?.id).toBe("near-ok");
    expect(picked?.get("__start__")?.id).toBe("lodging");
    expect(picked?.get("__end__")?.id).toBe("lodging");
  });

  it("applies the radius constraint to anchor edges too — an anchor far from every real candidate makes the path infeasible, same as any other adjacent pair", () => {
    const pools: SlotPool[] = [
      { slotKey: "__start__", candidates: [cand("start", 37.5, 127.0, 0)] },
      { slotKey: "sight", candidates: [cand("only", 40.0, 130.0, 10)] }, // 수백km 떨어짐
    ];
    expect(assembleRoute(pools, 5, false)).toBeNull();
  });
});
