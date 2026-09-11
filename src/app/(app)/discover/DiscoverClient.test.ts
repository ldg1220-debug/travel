import { describe, expect, it } from "vitest";
import { dedupeIntoPriorityBuckets } from "./DiscoverClient";
import type { LiveBucketKey } from "@/lib/liveCategoryBucket";
import type { Place } from "@/lib/types";

// 작업지시서 2026-09-09 "장소 상세 화면 통일" §4 → 2026-09-11 "중복
// 제거가 빈 레코드를 남깁니다"로 수정. 구글이 한 장소에 여러 place_id를
// 줄 때(예: 해유관 = tourist_attraction과 aquarium, 좌표차 170m) 이름이
// 같은 두 항목이 남는데, 처음엔 버킷 우선순위(관광지가 먼저)로만 골라
// 정보가 빈 tourist_attraction 레코드가 살아남는 역효과가 있었다. 이제는
// 평점/사진이 있는 쪽을 대표로 남기고, 그 자리는 여전히 우선순위 높은
// 버킷에 둔다. 이름만으로 묶으면 실제로 떨어진 동명 장소(체인점 등)까지
// 합쳐지므로 좌표 300m 조건도 같이 본다.

function place(
  id: string,
  name: string,
  category: string,
  opts: Partial<Pick<Place, "lat" | "lng" | "rating" | "reviewCount" | "photoName">> = {},
): Place {
  return {
    id,
    placeId: id,
    name,
    category,
    color: "#000",
    lat: opts.lat ?? 0,
    lng: opts.lng ?? 0,
    icon: "pin",
    rating: opts.rating,
    reviewCount: opts.reviewCount,
    photoName: opts.photoName,
  };
}

const ORDER: LiveBucketKey[] = ["관광지", "테마파크", "음식점", "술집", "카페", "숙소", "기타"];

describe("dedupeIntoPriorityBuckets", () => {
  it("merges a near-duplicate place_id pair (해유관 case) into the richer record, keeping the higher-priority bucket's slot", () => {
    const places = [
      place("g1", "해유관", "tourist_attraction", { lat: 34.6555, lng: 135.4283 }), // 관광지, 평점 없음
      place("g2", "해유관", "aquarium", {
        lat: 34.6555 + 0.0015, // ~170m
        lng: 135.4283,
        rating: 4.5,
        reviewCount: 61276,
        photoName: "places/g2/photos/1",
      }), // 테마파크, 평점·리뷰·사진 있음
    ];
    const result = dedupeIntoPriorityBuckets(places, ORDER);

    // 표시 위치는 그대로 관광지(더 높은 우선순위)에 남지만, 내용은
    // 평점 있는 aquarium 레코드를 쓴다 — 빈 레코드가 남던 버그의 수정.
    const tourist = result.get("관광지");
    expect(tourist?.map((p) => p.id)).toEqual(["g2"]);
    expect(tourist?.[0].rating).toBe(4.5);
    expect(tourist?.[0].reviewCount).toBe(61276);
    expect(result.get("테마파크")).toBeUndefined();
  });

  it("keeps the record with rating/reviewCount when only one of a duplicate pair has it", () => {
    const places = [
      place("r1", "붐비는가게", "cafe", { lat: 35, lng: 135 }),
      place("r2", "붐비는가게", "cafe", { lat: 35.001, lng: 135, rating: 4.2, reviewCount: 900 }), // ~111m, 같은 버킷
    ];
    const result = dedupeIntoPriorityBuckets(places, ORDER);
    const all = [...result.values()].flat();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("r2");
  });

  it("falls back to photo presence, then bucket priority, when rating is tied (both absent)", () => {
    const places = [
      place("p1", "동일가게", "tourist_attraction", { lat: 35, lng: 135 }), // 관광지, 사진 없음
      place("p2", "동일가게", "aquarium", { lat: 35.001, lng: 135, photoName: "places/p2/photos/1" }), // 테마파크, 사진 있음
    ];
    const result = dedupeIntoPriorityBuckets(places, ORDER);
    const tourist = result.get("관광지");
    expect(tourist?.map((p) => p.id)).toEqual(["p2"]);
    expect(result.get("테마파크")).toBeUndefined();
  });

  it("does not merge same-named places more than 300m apart (e.g. chain stores)", () => {
    const places = [
      place("c1", "스타벅스", "cafe", { lat: 35, lng: 135 }),
      place("c2", "스타벅스", "cafe", { lat: 35.01, lng: 135 }), // ~1.1km
    ];
    const result = dedupeIntoPriorityBuckets(places, ORDER);
    expect(result.get("카페")?.map((p) => p.id).sort()).toEqual(["c1", "c2"]);
  });

  it("is case/whitespace-insensitive when matching duplicate names", () => {
    const places = [place("a1", " 해유관 ", "tourist_attraction"), place("a2", "해유관", "aquarium")];
    const result = dedupeIntoPriorityBuckets(places, ORDER);
    // 둘 다 평점·사진이 없어 3순위(버킷 우선순위)로 승부 — 관광지가 더
    // 앞이라 a1이 대표로 남는다.
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
