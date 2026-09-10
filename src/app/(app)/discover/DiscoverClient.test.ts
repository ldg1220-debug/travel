import { describe, expect, it } from "vitest";
import { dedupeIntoPriorityBuckets } from "./DiscoverClient";
import type { LiveBucketKey } from "@/lib/liveCategoryBucket";
import type { Place } from "@/lib/types";

// 작업지시서 2026-09-09 "장소 상세 화면 통일" §4 — 구글이 한 장소에 여러
// 타입을 줄 때(예: 해유관 = tourist_attraction이면서 aquarium) 검색
// 결과에 이름이 같은 두 항목으로 남아 "관광지"에도 "테마파크"에도 뜨던
// 문제가 실제로 고쳐졌는지 확인한다.

function place(id: string, name: string, category: string): Place {
  return { id, placeId: id, name, category, color: "#000", lat: 0, lng: 0, icon: "pin" };
}

const ORDER: LiveBucketKey[] = ["관광지", "테마파크", "음식점", "술집", "카페", "숙소", "기타"];

describe("dedupeIntoPriorityBuckets", () => {
  it("keeps a duplicate name in only the highest-priority bucket it appears in (해유관 case)", () => {
    const places = [
      place("g1", "해유관", "tourist_attraction"), // → 관광지
      place("g2", "해유관", "aquarium"), // → 테마파크 (같은 이름, 더 낮은 우선순위 버킷)
      place("g3", "쿠마카페", "cafe"),
    ];
    const result = dedupeIntoPriorityBuckets(places, ORDER);

    expect(result.get("관광지")?.map((p) => p.id)).toEqual(["g1"]);
    expect(result.get("테마파크")).toBeUndefined(); // g2가 걸러져 이 버킷 자체가 비었다
    expect(result.get("카페")?.map((p) => p.id)).toEqual(["g3"]);
  });

  it("is case/whitespace-insensitive when matching duplicate names", () => {
    const places = [place("a1", " 해유관 ", "tourist_attraction"), place("a2", "해유관", "aquarium")];
    const result = dedupeIntoPriorityBuckets(places, ORDER);
    expect(result.get("관광지")?.map((p) => p.id)).toEqual(["a1"]);
    expect(result.get("테마파크")).toBeUndefined();
  });

  it("keeps distinct names in their own buckets even under the same category", () => {
    const places = [place("b1", "해유관", "aquarium"), place("b2", "쿠마카페", "aquarium")];
    const result = dedupeIntoPriorityBuckets(places, ORDER);
    expect(result.get("테마파크")?.map((p) => p.id).sort()).toEqual(["b1", "b2"]);
  });

  it("omits buckets that end up empty after dedup, and buckets not present in the input", () => {
    const places = [place("c1", "해유관", "tourist_attraction")];
    const result = dedupeIntoPriorityBuckets(places, ORDER);
    expect([...result.keys()]).toEqual(["관광지"]);
  });
});
