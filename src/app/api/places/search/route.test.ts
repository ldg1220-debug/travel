import { afterEach, describe, expect, it, vi } from "vitest";
import { searchByPlaceId } from "./route";

// 작업지시서 2026-09-09 "계획 탭 지도에서 장소 정보가 좌표만 나옵니다" §3 —
// 지도 POI 클릭이 넘겨주는 place_id로 이름(한글)·평점·리뷰수·카테고리·주소·
// 사진까지 한 번에 받아오는지 확인한다. 이 라우트의 q= 기반 검색 경로들은
// 이미 실제 fetch를 태우는 통합 로직이라 여기서는 새로 추가한 placeId
// 분기만 다룬다.

describe("searchByPlaceId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns an empty mock result when no Google API key is configured", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    expect(await searchByPlaceId("ChIJQ-VhVYvoAGARJsKgJKTie_4")).toEqual({ places: [], source: "mock" });
  });

  it("parses a successful lookup into a full Place (실측: 덴포잔 대관람차 — 한글 이름·평점·리뷰수·카테고리·주소·사진)", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "ChIJQ-VhVYvoAGARJsKgJKTie_4",
          displayName: { text: "덴포잔 대관람차" },
          formattedAddress: "일본 〒552-0022 Ōsaka, Minato Ward, Kaigandori, 1 Chome−1−10",
          location: { latitude: 34.65626, longitude: 135.43095 },
          rating: 4.6,
          userRatingCount: 12345,
          primaryType: "ferris_wheel",
          photos: [{ name: "places/ChIJQ-VhVYvoAGARJsKgJKTie_4/photos/abc" }],
        }),
      }),
    );
    const result = await searchByPlaceId("ChIJQ-VhVYvoAGARJsKgJKTie_4");
    expect(result.source).toBe("google");
    expect(result.places).toHaveLength(1);
    expect(result.places[0]).toMatchObject({
      id: "ChIJQ-VhVYvoAGARJsKgJKTie_4",
      placeId: "ChIJQ-VhVYvoAGARJsKgJKTie_4",
      name: "덴포잔 대관람차",
      category: "ferris_wheel",
      rating: 4.6,
      reviewCount: 12345,
      photoName: "places/ChIJQ-VhVYvoAGARJsKgJKTie_4/photos/abc",
    });
    expect(result.places[0].address).toContain("Minato Ward");
    // 좌표는 부가 정보로만 남는다 — 화면에 좌표만 보여주던 문제(§1/§3)의
    // 대상은 "이름 대신 좌표를 주 정보로 쓰는 것"이지, Place 자체가 lat/lng를
    // 안 가져야 한다는 뜻은 아니다(마커 위치 등에 계속 필요).
    expect(result.places[0].lat).toBeCloseTo(34.65626, 4);
  });

  it("returns an empty mock result when Google responds with a non-ok status", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: "Not Found", text: async () => "" }));
    expect(await searchByPlaceId("bogus-id")).toEqual({ places: [], source: "mock" });
  });

  it("returns an empty mock result when the response has no place id (철회된/존재하지 않는 place_id)", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await searchByPlaceId("bogus-id")).toEqual({ places: [], source: "mock" });
  });
});
