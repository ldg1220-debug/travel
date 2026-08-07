import { describe, expect, it } from "vitest";
import type { RouteCandidate } from "./courseRoute";
import {
  curateTaste,
  deterministicShortlistForSlot,
  deterministicTaste,
  expandShortlist,
  templateReason,
  type TasteCandidate,
  type TasteSlotInput,
} from "./courseTaste";

function taste(id: string, overrides: Partial<TasteCandidate> = {}): TasteCandidate {
  return { id, name: id, category: "restaurant", rating: null, reviews: null, ...overrides };
}

// Full RouteCandidate objects a real fetchSlotCandidates→resolve() would hand back — id/name/coords only, taste/reason get overwritten by the caller.
function resolverFor(ids: string[]): (slotKey: string, id: string) => RouteCandidate | undefined {
  const byId = new Map(ids.map((id) => [id, { id, name: id, lat: 37.5, lng: 127, taste: 0 } as RouteCandidate]));
  return (_slotKey, id) => byId.get(id);
}

describe("deterministicTaste", () => {
  it("uses rating × log10(reviews+10) when both are present — matches the v1 scale", () => {
    const score = deterministicTaste(taste("a", { rating: 4.5, reviews: 990 }), 0);
    expect(score).toBeCloseTo(4.5 * Math.log10(1000), 5);
  });

  it("falls back to a search-rank-based score when rating/reviews are missing (Kakao Local case)", () => {
    expect(deterministicTaste(taste("a"), 0)).toBe(10);
    expect(deterministicTaste(taste("b"), 1)).toBeCloseTo(8.8, 5);
  });

  it("floors the rank-based fallback at 1 instead of going negative for a very low rank", () => {
    expect(deterministicTaste(taste("z"), 50)).toBe(1);
  });
});

describe("deterministicShortlistForSlot", () => {
  it("sorts by taste descending and caps at SHORTLIST_SIZE (3)", () => {
    const slot: TasteSlotInput = {
      slotKey: "lunch",
      slotLabel: "점심",
      candidates: [
        taste("low", { rating: 3.5, reviews: 50 }),
        taste("high", { rating: 4.8, reviews: 2000 }),
        taste("mid", { rating: 4.2, reviews: 500 }),
        taste("extra", { rating: 4.0, reviews: 100 }),
      ],
    };
    const result = deterministicShortlistForSlot(slot, resolverFor(["low", "high", "mid", "extra"]));
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0].id).toBe("high");
    expect(result.candidates.map((c) => c.id)).not.toContain("low");
  });

  it("drops a candidate that resolve() can't find instead of throwing", () => {
    const slot: TasteSlotInput = { slotKey: "lunch", slotLabel: "점심", candidates: [taste("ghost", { rating: 5, reviews: 10 })] };
    const result = deterministicShortlistForSlot(slot, () => undefined);
    expect(result.candidates).toHaveLength(0);
  });
});

describe("templateReason", () => {
  it("formats rating+reviews with a k-suffix over 1000", () => {
    expect(templateReason(taste("a", { rating: 4.5, reviews: 1200 }))).toBe("평점 4.5 · 리뷰 1.2k");
  });

  it("falls back to a generic label when there's no rating data", () => {
    expect(templateReason(taste("a"))).toBe("이 지역 인기 검색 결과");
  });
});

describe("expandShortlist", () => {
  it("adds fresh candidates not already shown or brand-duplicated, capping taste below the original shortlist's floor", () => {
    const pool = { slotKey: "cafe", candidates: [{ id: "kept", name: "kept", lat: 37.5, lng: 127, taste: 7 } as RouteCandidate] };
    const fresh: TasteCandidate[] = [
      taste("kept"), // already in the pool — must not duplicate
      taste("shown-elsewhere"), // already shown via a previous reroll — must be excluded
      taste("우오신 우메다점", { rating: 4.9, reviews: 5000 }), // same brand as an existing pool entry
      taste("fresh-1", { rating: 4.5, reviews: 300 }),
    ];
    const poolWithBrand = { slotKey: "cafe", candidates: [...pool.candidates, { id: "brand-orig", name: "우오신 우메다점", lat: 37.5, lng: 127, taste: 6 } as RouteCandidate] };
    const result = expandShortlist(
      poolWithBrand,
      fresh,
      resolverFor(["kept", "shown-elsewhere", "우오신 우메다점", "fresh-1", "brand-orig"]),
      new Set(["shown-elsewhere"]),
      (a, b) => a === b,
    );
    const addedIds = result.candidates.slice(poolWithBrand.candidates.length).map((c) => c.id);
    expect(addedIds).toEqual(["fresh-1"]);
    expect(result.candidates.find((c) => c.id === "fresh-1")!.taste).toBeLessThanOrEqual(6.5);
  });
});

describe("curateTaste", () => {
  const slots: TasteSlotInput[] = [
    { slotKey: "lunch", slotLabel: "점심", candidates: [taste("real-1", { rating: 4.5, reviews: 100 }), taste("real-2", { rating: 4.0, reviews: 50 })] },
    { slotKey: "cafe", slotLabel: "카페", candidates: [taste("cafe-1", { rating: 4.7, reviews: 80 })] },
  ];
  const resolve = resolverFor(["real-1", "real-2", "cafe-1"]);

  it("parses a valid response and attaches rank-based taste + trimmed reason", async () => {
    const callLlm = async () =>
      JSON.stringify({
        slots: [
          { slot: "lunch", picks: [{ id: "real-2", reason: "가성비 최고" }, { id: "real-1", reason: "분위기 좋음" }] },
          { slot: "cafe", picks: [{ id: "cafe-1", reason: "루프탑 뷰" }] },
        ],
      });
    const result = await curateTaste("도쿄", "밸런스", slots, resolve, callLlm);
    expect(result).not.toBeNull();
    const lunch = result!.find((s) => s.slotKey === "lunch")!;
    expect(lunch.candidates.map((c) => c.id)).toEqual(["real-2", "real-1"]);
    expect(lunch.candidates[0].taste).toBe(10);
    expect(lunch.candidates[1].taste).toBe(8.5);
    expect(lunch.candidates[0].reason).toBe("가성비 최고");
  });

  it("still parses when the LLM wraps the JSON in a code fence or extra prose", async () => {
    const callLlm = async () => "```json\n" + JSON.stringify({ slots: [{ slot: "cafe", picks: [{ id: "cafe-1", reason: "ok" }] }] }) + "\n```\nHope this helps!";
    const result = await curateTaste("도쿄", "밸런스", slots, resolve, callLlm);
    expect(result?.find((s) => s.slotKey === "cafe")?.candidates[0].id).toBe("cafe-1");
  });

  it("drops a pick that references a nonexistent id (hallucination guard) and falls back that slot to deterministic", async () => {
    const callLlm = async () => JSON.stringify({ slots: [{ slot: "cafe", picks: [{ id: "made-up-id", reason: "..." }] }] });
    const result = await curateTaste("도쿄", "밸런스", slots, resolve, callLlm);
    const cafe = result!.find((s) => s.slotKey === "cafe")!;
    // Only real candidate for "cafe" is cafe-1, so the deterministic fallback should still surface it.
    expect(cafe.candidates.map((c) => c.id)).toEqual(["cafe-1"]);
  });

  it("returns null when the LLM call throws (caller falls back to full deterministic)", async () => {
    const callLlm = async (): Promise<string> => {
      throw new Error("network down");
    };
    await expect(curateTaste("도쿄", "밸런스", slots, resolve, callLlm)).resolves.toBeNull();
  });

  it("returns null for unparseable output instead of throwing", async () => {
    const callLlm = async () => "not json at all";
    await expect(curateTaste("도쿄", "밸런스", slots, resolve, callLlm)).resolves.toBeNull();
  });

  it("caps picks per slot at SHORTLIST_SIZE even if the LLM returns more", async () => {
    const manySlots: TasteSlotInput[] = [
      { slotKey: "lunch", slotLabel: "점심", candidates: ["p1", "p2", "p3", "p4"].map((id) => taste(id, { rating: 4, reviews: 10 })) },
    ];
    const manyResolve = resolverFor(["p1", "p2", "p3", "p4"]);
    const callLlm = async () =>
      JSON.stringify({ slots: [{ slot: "lunch", picks: [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }] }] });
    const result = await curateTaste("도쿄", "밸런스", manySlots, manyResolve, callLlm);
    expect(result![0].candidates).toHaveLength(3);
  });

  // 오사카 실측: 해외 장소명이 길어 max_tokens 도중에 응답이 잘려
  // 통째로 파싱 실패하던 사례 — 완결된 슬롯만이라도 건져 쓰는지 검증.
  it("recovers whatever complete slots came through before the response got cut off mid-object", async () => {
    const full = JSON.stringify({
      slots: [
        { slot: "lunch", picks: [{ id: "real-1", reason: "분위기 좋음" }] },
        { slot: "cafe", picks: [{ id: "cafe-1", reason: "루프탑 뷰" }] },
      ],
    });
    // Simulate max_tokens cutting the stream mid-way through the second slot's object.
    const cutPoint = full.indexOf('"cafe-1"') + 4;
    const truncated = full.slice(0, cutPoint);
    const callLlm = async () => truncated;
    const result = await curateTaste("오사카", "밸런스", slots, resolve, callLlm);
    expect(result).not.toBeNull();
    // "lunch" was fully present before the cut — recovered as real LLM output.
    expect(result!.find((s) => s.slotKey === "lunch")?.candidates.map((c) => c.id)).toEqual(["real-1"]);
    // "cafe" was mid-object when the stream cut — nothing to recover, so it
    // falls back to the same per-slot deterministic path as an LLM omission.
    expect(result!.find((s) => s.slotKey === "cafe")?.candidates.map((c) => c.id)).toEqual(["cafe-1"]);
  });

  it("doesn't mistake a `}` inside an earlier (recoverable) slot's quoted reason for that object's end — only exercises the recovery scanner when the tail is actually truncated, since a fully valid response never reaches it", async () => {
    const full = JSON.stringify({
      slots: [
        { slot: "lunch", picks: [{ id: "real-1", reason: "이유(참고: {특별함})" }] },
        { slot: "cafe", picks: [{ id: "cafe-1", reason: "루프탑 뷰" }] },
      ],
    });
    const cutPoint = full.indexOf('"cafe-1"') + 4;
    const callLlm = async () => full.slice(0, cutPoint);
    const result = await curateTaste("도쿄", "밸런스", slots, resolve, callLlm);
    // If the brace inside "lunch"'s reason were miscounted as closing the
    // object early, this pick (and its reason) would come out wrong or the
    // recovery would misfire entirely.
    const lunch = result!.find((s) => s.slotKey === "lunch")!;
    expect(lunch.candidates[0]?.id).toBe("real-1");
    expect(lunch.candidates[0]?.reason).toBe("이유(참고: {특별함})");
  });

  it("still returns null when truncation happens before even one complete slot object exists", async () => {
    const callLlm = async () => '{"slots":[{"slot":"lunch","pi';
    await expect(curateTaste("도쿄", "밸런스", slots, resolve, callLlm)).resolves.toBeNull();
  });
});
