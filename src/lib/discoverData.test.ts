import { describe, expect, it } from "vitest";
import {
  allSpots,
  flatRegions,
  isPlaceholderSpot,
  OVERSEAS_LOCALITY_NAMES,
  parseSearchQuery,
  regionHierarchy,
  resolveLeafCityCoords,
  resolveRegionAlias,
  suggestOverseasRegions,
} from "./discoverData";

describe("parseSearchQuery", () => {
  it("strips a trailing intent keyword and tags the category", () => {
    expect(parseSearchQuery("경주 맛집")).toEqual({ coreQuery: "경주", intentTag: "음식점" });
  });

  it("returns no intent tag for a plain place search", () => {
    expect(parseSearchQuery("경주")).toEqual({ coreQuery: "경주", intentTag: null });
  });

  // Regression coverage for #87 — locality filler words carry no category
  // meaning and must be dropped before intent-keyword matching, otherwise
  // they'd break the AND-of-tokens match against place names/regions.
  it("drops locality filler words like 근처/인근/주변", () => {
    expect(parseSearchQuery("우메다 근처 맛집")).toEqual({ coreQuery: "우메다", intentTag: "음식점" });
  });

  // Regression coverage for the dish-keyword fallback (#79) — a query with
  // no explicit "맛집"/"음식점" suffix should still infer food intent from
  // a recognizable dish name, and keep the dish word in coreQuery since
  // it's also a real subTags match term.
  it("infers 음식점 intent from a bare dish keyword with no explicit suffix", () => {
    expect(parseSearchQuery("오사카 라멘")).toEqual({ coreQuery: "오사카 라멘", intentTag: "음식점" });
  });

  it("returns an empty coreQuery when the query is only the intent keyword", () => {
    expect(parseSearchQuery("맛집")).toEqual({ coreQuery: "", intentTag: "음식점" });
  });

  it("prefers the longest matching intent keyword (게스트하우스 over 숙소)", () => {
    expect(parseSearchQuery("교토 게스트하우스")).toEqual({ coreQuery: "교토", intentTag: "숙소" });
  });
});

// GitHub #164 — 템플릿 생성 스팟("종로 레트로 골목" 류 실존 확인 안 된
// 채움용 카드, discoverData.ts 전체의 84%였음) 제거 이후의 회귀 테스트.
describe("템플릿 생성 스팟 제거 (#164)", () => {
  it("isPlaceholderSpot을 만족하는 스팟이 더 이상 없다", () => {
    for (const scope of ["domestic", "overseas"] as const) {
      expect(allSpots(scope).filter(isPlaceholderSpot)).toEqual([]);
    }
  });

  it("템플릿으로만 채워졌던 도시도 지역별 드릴다운에서 여전히 선택 가능하다 (라이브 검색 진입점)", () => {
    const overseasTree = regionHierarchy("overseas");
    const japan = overseasTree.find((c) => c.label === "아시아")?.children.find((c) => c.label === "일본");
    expect(japan?.children.map((c) => c.label)).toContain("나고야");

    const domesticTree = regionHierarchy("domestic");
    const gangwon = domesticTree.find((p) => p.label === "강원");
    expect(gangwon?.children.map((c) => c.label)).toContain("강릉");
  });
});

// 2026-08-14 긴급 조치 — pushGeneratedBatch/generateSpots가 실존 지명에
// 수학적으로 계산한(실제 위치와 무관한) 좌표를 붙이던 문제. 같은 배치 안
// trending[i]/favorites[i]가 항상 같은 좌표를 갖는 게 원인이었고(#166
// 후속 실측: 문무대왕릉·감은사지가 좌표만 복제), 실제로는 앵커에서
// 수십 km 떨어진 진짜 장소도 섞여 있어 지도 핀이 크게 틀렸다.
describe("좌표 미검증 생성 스팟 노출 차단 (2026-08-14)", () => {
  it("생성 배치 접두사(d-gj-/o-osk-/o-umd-/CITY_SEEDS)가 노출 목록에 하나도 없다", () => {
    const GENERATED_PREFIXES = ["d-gj-", "o-osk-", "o-umd-"];
    for (const scope of ["domestic", "overseas"] as const) {
      const spots = allSpots(scope);
      for (const prefix of GENERATED_PREFIXES) {
        expect(spots.filter((s) => s.id.startsWith(prefix))).toEqual([]);
      }
      // CITY_SEEDS(다낭·오사카 등 국가-도시 2글자 접두사 배치) 전수 —
      // "o-xx-yy-attr/food/stay" 패턴 전체가 대상이라 개별 나열 대신
      // 정규식으로 훑는다.
      expect(spots.filter((s) => /^o-[a-z]{2}-[a-z]{2,3}-(attr|food|stay)-/.test(s.id))).toEqual([]);
    }
  });

  it("실측으로 확인된 좌표-복제 사례(문무대왕릉 등)가 더 이상 노출되지 않는다", () => {
    const overseas = allSpots("overseas");
    const domestic = allSpots("domestic");
    for (const name of ["문무대왕릉", "감은사지 삼층석탑", "양동마을"]) {
      expect(domestic.find((s) => s.name === name)).toBeUndefined();
    }
    // 오사카/다낭 큐레이션도 생성 배치였던 만큼 크게 줄어든다 — 손으로
    // 쓴 항목(d-t*/d-f* 같은 초기 큐레이션)만 남아야 한다.
    expect(overseas.find((s) => s.id.startsWith("o-vn-dn-"))).toBeUndefined();
  });

  it("손으로 쓴 큐레이션(생성 배치 아닌 것)은 그대로 남아있다", () => {
    const domestic = allSpots("domestic");
    // d-t5/d-t6처럼 초기부터 있던 손큐레이션 경주 스팟 — 생성 배치와
    // 무관하므로 필터에 걸리면 안 된다.
    expect(domestic.some((s) => s.id === "d-t5")).toBe(true);
    expect(domestic.some((s) => s.id === "d-t6")).toBe(true);
  });
});

// 평점·좌표 매칭 실측(2026-08-14, 프로덕션 81곳 전수 조회) 반영 이후의
// 회귀 테스트. TSV 원본은 세션 채팅에만 있고 discoverData.ts에는 그
// 결과(placeId/rating/reviewCount/좌표/제거·개명)만 반영돼 있다.
describe("평점·좌표 매칭 반영 (2026-08-14)", () => {
  it("오매칭·실체불명으로 확정 제거된 6곳이 더 이상 노출되지 않는다", () => {
    const removed = ["o-f11", "o-f10", "o-f12", "d-f15", "d-f12", "o-t3"];
    const ids = new Set([...allSpots("domestic"), ...allSpots("overseas")].map((s) => s.id));
    for (const id of removed) expect(ids.has(id)).toBe(false);
  });

  it("중복 등록 2건(타이베이 101 o-t8, 왓아룬 o-t7)이 제거되고 남은 쪽만 있다", () => {
    const ids = new Set([...allSpots("domestic"), ...allSpots("overseas")].map((s) => s.id));
    expect(ids.has("o-t8")).toBe(false);
    expect(ids.has("o-t7")).toBe(false);
    expect(ids.has("o-tw1")).toBe(true);
    expect(ids.has("o-th1")).toBe(true);
  });

  it("같은 이름으로 중복 노출되는 스팟이 없다", () => {
    const names = new Map<string, string[]>();
    for (const s of [...allSpots("domestic"), ...allSpots("overseas")]) {
      names.set(s.name, [...(names.get(s.name) ?? []), s.id]);
    }
    for (const [, ids] of names) expect(ids.length).toBe(1);
  });

  it("matched 스팟은 placeId·rating·reviewCount를 갖고 좌표는 그대로다", () => {
    const spot = allSpots("domestic").find((s) => s.id === "d-t1")!;
    expect(spot.placeId).toBe("ChIJI9pHulD1DDURR1SI8elRLgA");
    expect(spot.rating).toBe(4.3);
    expect(spot.reviewCount).toBe(526);
    expect(spot.lat).toBeCloseTo(33.4623, 3);
  });

  it("좌표 교체 대상은 Google 좌표로 갱신됐다", () => {
    const spot = allSpots("domestic").find((s) => s.id === "d-t3")!;
    expect(spot.lat).toBeCloseTo(35.1612808, 5);
    expect(spot.lng).toBeCloseTo(129.1913941, 5);
    expect(spot.placeId).toBe("ChIJR7h_LQCNaDURQK_M1jg4KsM");
  });

  it("통칭이었던 재정의 대상은 실체 있는 이름으로 바뀌었다", () => {
    const byId = Object.fromEntries(allSpots("overseas").map((s) => [s.id, s]));
    expect(byId["o-t12"].name).toBe("하롱베이 크루즈 선착장");
    expect(byId["o-fr3"].name).toBe("몽마르뜨 언덕");
    expect(byId["o-us3"].name).toBe("덤보(DUMBO)");
    // 음식점 통칭에서 지역 명소로 재정의된 곳은 cuisine 필드를 더는 갖지 않는다.
    expect(byId["o-fr3"].cuisine).toBeUndefined();
    expect(byId["o-us3"].cuisine).toBeUndefined();
  });
});

describe("resolveLeafCityCoords", () => {
  it("해외: [대륙,국가,도시]가 다 있어야 좌표를 찾는다", () => {
    expect(resolveLeafCityCoords("overseas", ["아시아", "일본", "나고야"])).toEqual({
      city: "나고야",
      region: "일본 · 나고야",
      lat: 35.1815,
      lng: 136.9066,
    });
  });

  it("해외: 대륙/국가만으로는 도시가 특정되지 않아 null", () => {
    expect(resolveLeafCityCoords("overseas", ["아시아", "일본"])).toBeNull();
    expect(resolveLeafCityCoords("overseas", ["아시아"])).toBeNull();
  });

  it("국내: 도-소속 도시(bare label)를 찾는다", () => {
    expect(resolveLeafCityCoords("domestic", ["강원", "강릉"])).toEqual({
      city: "강릉",
      region: "강릉",
      lat: 37.7519,
      lng: 128.8761,
    });
  });

  it("국내: metro 동네(\"광역 · 동네\" 포맷)를 찾는다", () => {
    expect(resolveLeafCityCoords("domestic", ["서울", "성수"])).toEqual({
      city: "성수",
      region: "서울 · 성수",
      lat: 37.5445,
      lng: 127.0557,
    });
  });

  it("카탈로그에 없는 도시는 null (실존 큐레이션 도시는 애초에 이 경로를 안 탐)", () => {
    expect(resolveLeafCityCoords("domestic", ["강원", "존재안함"])).toBeNull();
  });
});

// 작업지시서 2026-08-24, "숙소 CTA 제보 4건 진단" 4항 — 국내 스코프
// 검색이 Kakao 리터럴 매칭으로 빠지면서 "도쿄 숙소" 같은 질의에 한국
// 상호가 섞여 나오던 문제의 게이팅 근거 카탈로그.
describe("OVERSEAS_LOCALITY_NAMES", () => {
  it("WORLD_CITIES/스팟 카탈로그의 실제 국가·도시 이름을 담고 있다", () => {
    expect(OVERSEAS_LOCALITY_NAMES.has("도쿄")).toBe(true);
    expect(OVERSEAS_LOCALITY_NAMES.has("일본")).toBe(true);
    expect(OVERSEAS_LOCALITY_NAMES.has("오사카")).toBe(true);
  });

  it("국내 지명은 포함하지 않는다", () => {
    expect(OVERSEAS_LOCALITY_NAMES.has("서울")).toBe(false);
    expect(OVERSEAS_LOCALITY_NAMES.has("부산")).toBe(false);
    expect(OVERSEAS_LOCALITY_NAMES.has("서귀포")).toBe(false);
  });

  // 작업지시서 2026-09-23 "한국인이 가장 많이 가는 나라 셋이 0개입니다" —
  // 필리핀·인도네시아·싱가포르·말레이시아가 통째로 빠져 있어 "코타키나발루"
  // 같은 검색량 큰 지역이 전부 미지원이었다.
  it("2026-09-23 추가분 — 필리핀·인도네시아·싱가포르·말레이시아·괌·사이판·치앙마이를 담고 있다", () => {
    for (const name of ["필리핀", "세부", "보라카이", "마닐라", "팔라완", "인도네시아", "우붓", "쿠타", "스미냑", "자카르타", "싱가포르", "말레이시아", "코타키나발루", "쿠알라룸푸르", "페낭", "괌", "사이판", "치앙마이"]) {
      expect(OVERSEAS_LOCALITY_NAMES.has(name)).toBe(true);
    }
  });

  // 작업지시서 2026-09-23 "#267 검증" §3 — 필리핀 수요 2위권인데 목록에 없었다.
  it("보홀을 담고 있다 (작업지시서 2026-09-23 '#267 검증' §3)", () => {
    expect(OVERSEAS_LOCALITY_NAMES.has("보홀")).toBe(true);
  });
});

describe("resolveRegionAlias — 사용자 표기를 카탈로그 정본 이름으로 정규화 (작업지시서 2026-09-23 §5)", () => {
  it("maps a known alias to its canonical, data-backed name", () => {
    expect(resolveRegionAlias("나트랑")).toBe("냐짱");
    expect(resolveRegionAlias("타이페이")).toBe("타이베이");
  });

  it("maps 호찌민 to 호치민 — inverted from the work order's example, since 호치민 is the name the catalog actually has data under", () => {
    expect(resolveRegionAlias("호찌민")).toBe("호치민");
  });

  it("every alias target actually exists in the overseas catalog — an alias to nowhere is worse than no alias", () => {
    expect(OVERSEAS_LOCALITY_NAMES.has("냐짱")).toBe(true);
    expect(OVERSEAS_LOCALITY_NAMES.has("호치민")).toBe(true);
    expect(OVERSEAS_LOCALITY_NAMES.has("타이베이")).toBe(true);
    expect(OVERSEAS_LOCALITY_NAMES.has("우붓")).toBe(true);
    expect(OVERSEAS_LOCALITY_NAMES.has("코타키나발루")).toBe(true);
  });

  // 작업지시서 2026-09-23 "#267 검증: 새 지역은 잘 됩니다 / 지역 목록이
  // 24시간 옛것으로 나갑니다 / '발리'가 404" §3 — 한국인 출국 10위
  // 지역을 사람들이 부르는 이름은 "발리"이지 우붓이 아니다.
  it("maps 발리 to 우붓 and 코타 to 코타키나발루 (작업지시서 2026-09-23 '#267 검증' §3)", () => {
    expect(resolveRegionAlias("발리")).toBe("우붓");
    expect(resolveRegionAlias("코타")).toBe("코타키나발루");
  });

  it("passes through a region that isn't an alias unchanged", () => {
    expect(resolveRegionAlias("경주")).toBe("경주");
    expect(resolveRegionAlias("세부")).toBe("세부");
  });
});

describe("flatRegions(overseas) — aliases/popularity 부가 정보 (작업지시서 2026-09-23 §6)", () => {
  const overseas = flatRegions("overseas");

  it("attaches aliases to a region that has one", () => {
    const nyachang = overseas.find((r) => r.name === "냐짱");
    expect(nyachang?.aliases).toEqual(["나트랑"]);
  });

  it("omits the aliases field for a region with no alias", () => {
    const osaka = overseas.find((r) => r.name === "오사카");
    expect(osaka?.aliases).toBeUndefined();
  });

  it("attaches popularity to countries the work order ranked, ranking 일본 above 필리핀", () => {
    const tokyo = overseas.find((r) => r.name === "도쿄" && r.parent === "일본");
    const cebu = overseas.find((r) => r.name === "세부" && r.parent === "필리핀");
    expect(tokyo?.popularity).toBeDefined();
    expect(cebu?.popularity).toBeDefined();
    expect(tokyo!.popularity!).toBeLessThan(cebu!.popularity!);
  });

  it("omits popularity for a country the work order didn't rank", () => {
    const nairobi = overseas.find((r) => r.name === "나이로비" && r.parent === "케냐");
    expect(nairobi?.popularity).toBeUndefined();
  });
});

describe("suggestOverseasRegions — 미지원 지역 응답에 실을 고정 대안 목록 (작업지시서 2026-09-23 §5)", () => {
  it("only returns regions that are actually in the supported catalog", () => {
    for (const s of suggestOverseasRegions()) {
      expect(OVERSEAS_LOCALITY_NAMES.has(s.name)).toBe(true);
    }
  });

  it("returns a non-empty, stable list", () => {
    expect(suggestOverseasRegions().length).toBeGreaterThan(0);
    expect(suggestOverseasRegions()).toEqual(suggestOverseasRegions());
  });
});
