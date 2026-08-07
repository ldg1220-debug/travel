import { describe, expect, it } from "vitest";
import { assembleRoute, assembleRouteWithEscalation, dedupePoolsByBrand, haversineKm, rerollSlot, type RouteCandidate, type SlotPool } from "./courseRoute";

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
