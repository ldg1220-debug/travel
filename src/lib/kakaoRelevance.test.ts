import { describe, expect, it } from "vitest";
import { sortKakaoByRelevance, kakaoCategoryTier } from "./kakaoRelevance";
import type { KakaoRelevanceDoc } from "./kakaoRelevance";

// 실제 프로덕션 라이브 테스트에서 확인된 "경복궁"/"서울역" 검색 응답 —
// 지금 이 재정렬이 없으면 실제 랜드마크가 아예 안 보이거나 하위로 밀린다.
const GYEONGBOKGUNG_RESPONSE: KakaoRelevanceDoc[] = [
  { place_name: "쏘아베에스테틱", category_group_code: "" },
  { place_name: "광화문포시즌부동산중개", category_group_code: "AG2" },
  { place_name: "후라토식당 경복궁본점", category_group_code: "FD6" },
  { place_name: "우슴 광화문 경복궁 본점", category_group_code: "FD6" },
  { place_name: "경복궁식당", category_group_code: "FD6" },
  { place_name: "경복궁", category_group_code: "AT4" },
];

const SEOUL_STATION_RESPONSE: KakaoRelevanceDoc[] = [
  { place_name: "시청역 1호선", category_group_code: "SW8" },
  { place_name: "서울특별시청 서울역일대종합발전기획단", category_group_code: "" },
  { place_name: "서울역", category_group_code: "SW8" },
];

describe("sortKakaoByRelevance", () => {
  it("경복궁 검색 — 실제 관광명소가 1위, 이름만 겹치는 식당/중개업소는 뒤로", () => {
    const sorted = sortKakaoByRelevance(GYEONGBOKGUNG_RESPONSE, "경복궁");
    expect(sorted[0].place_name).toBe("경복궁");
  });

  it("서울역 검색 — 이름이 다른 시청역이 앞서지 않고, 정확히 일치하는 서울역이 1위", () => {
    const sorted = sortKakaoByRelevance(SEOUL_STATION_RESPONSE, "서울역");
    expect(sorted[0].place_name).toBe("서울역");
    expect(sorted[0].place_name).not.toBe("시청역 1호선");
  });

  it("이름 완전일치가 카테고리 등급보다 항상 우선한다 (진짜 상호명 검색이 밀리지 않아야 함)", () => {
    const docs: KakaoRelevanceDoc[] = [
      { place_name: "우래옥 근처 관광안내소", category_group_code: "AT4" }, // 카테고리는 상위, 이름은 부분일치
      { place_name: "우래옥", category_group_code: "FD6" }, // 카테고리는 하위, 이름은 완전일치
    ];
    const sorted = sortKakaoByRelevance(docs, "우래옥");
    expect(sorted[0].place_name).toBe("우래옥");
  });

  it("접두 일치가 단순 부분 포함보다 우선한다", () => {
    const docs: KakaoRelevanceDoc[] = [
      { place_name: "신촌 광화문 곱창", category_group_code: "FD6" }, // "광화문" 포함이지만 접두 아님
      { place_name: "광화문 스타벅스", category_group_code: "CE7" }, // "광화문"으로 시작
    ];
    const sorted = sortKakaoByRelevance(docs, "광화문");
    expect(sorted[0].place_name).toBe("광화문 스타벅스");
  });

  it("동일 등급 내에서는 원래(Kakao 자체) 순서를 안정적으로 유지한다", () => {
    const docs: KakaoRelevanceDoc[] = [
      { place_name: "A식당", category_group_code: "FD6" },
      { place_name: "B식당", category_group_code: "FD6" },
      { place_name: "C식당", category_group_code: "FD6" },
    ];
    const sorted = sortKakaoByRelevance(docs, "아무개역");
    expect(sorted.map((d) => d.place_name)).toEqual(["A식당", "B식당", "C식당"]);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const docs: KakaoRelevanceDoc[] = [
      { place_name: "부동산중개", category_group_code: "AG2" },
      { place_name: "경복궁", category_group_code: "AT4" },
    ];
    const original = [...docs];
    sortKakaoByRelevance(docs, "경복궁");
    expect(docs).toEqual(original);
  });
});

describe("kakaoCategoryTier", () => {
  it("관광명소/지하철역이 최상위(0)", () => {
    expect(kakaoCategoryTier("AT4")).toBe(0);
    expect(kakaoCategoryTier("SW8")).toBe(0);
  });

  it("음식점/카페는 중간(2)", () => {
    expect(kakaoCategoryTier("FD6")).toBe(2);
    expect(kakaoCategoryTier("CE7")).toBe(2);
  });

  it("중개업소·학원·은행 등 목록에 없는/빈 코드는 최하위(3)", () => {
    expect(kakaoCategoryTier("AG2")).toBe(3);
    expect(kakaoCategoryTier("AC5")).toBe(3);
    expect(kakaoCategoryTier("BK9")).toBe(3);
    expect(kakaoCategoryTier("")).toBe(3);
    expect(kakaoCategoryTier(undefined)).toBe(3);
  });
});
