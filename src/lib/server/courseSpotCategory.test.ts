import { describe, expect, it } from "vitest";
import { courseSpotCategory } from "./courseSpotCategory";

// 작업지시서 2026-10-12 "#304 검증" §3 — 코스 스팟 종류(해외 포함): "기타"는 정말 단서가 없을 때만.
const c = (category: string, name: string, beach?: boolean) => courseSpotCategory({ category, name, beach });

describe("courseSpotCategory — primaryType 정확 일치", () => {
  it.each([
    ["spa", "Cheeva Spa", "스파"],
    ["massage", "골드문", "스파"],
    ["beauty_salon", "Sage", "스파"],
    ["church", "산토니뇨 성당", "사원·성당"],
    ["hindu_temple", "Hindu Temple", "사원·성당"],
    ["buddhist_temple", "센소지", "사원·성당"],
    ["shinto_shrine", "메이지 신궁", "사원·성당"],
    ["place_of_worship", "Cebu Taoist Temple", "사원·성당"],
    ["beach", "수바-배즈바스 퍼블릭 비치", "해변"],
    ["ferry_terminal", "힐튼 선착장", "선착장"],
    ["pier", "Pier", "선착장"],
    ["island", "사피 섬", "섬"],
    ["aquarium", "오사카 해유관", "수족관"],
    ["zoo", "Crocolandia", "동물원"],
    ["amusement_park", "유니버설 스튜디오 재팬", "테마파크"],
    ["observation_deck", "도쿄 스카이트리", "전망대"],
    ["park", "신주쿠 교엔", "공원"],
    ["national_park", "Kinabalu Park", "공원"],
    ["garden", "Botanical", "공원"],
    ["castle", "오사카 성", "명소/유적"],
    ["historical_landmark", "Fort San Pedro", "명소/유적"],
    ["museum", "국립박물관", "명소/유적"],
    ["steak_house", "Godaime Wagyu Tokyo", "음식점"],
  ])("%s %s → %s", (category, name, expected) => {
    expect(c(category, name)).toBe(expected);
  });

  it("수족관·동물원은 테마파크가 아니다 — Kakao 한글 분류도", () => {
    expect(c("테마파크", "롯데월드 아쿠아리움")).toBe("테마파크"); // 분류 문자열이 테마파크면 그대로(이름만으로 뒤집지 않는다)
    expect(c("아쿠아리움", "코엑스 아쿠아리움")).toBe("수족관");
    expect(c("동물원", "서울대공원 동물원")).toBe("동물원");
  });
});

describe("courseSpotCategory — 식음료·숙소는 기존 버킷", () => {
  it("restaurant 계열·카페·술집·숙소", () => {
    expect(c("restaurant", "House of Lechon")).toBe("음식점");
    expect(c("seafood_restaurant", "Cabana")).toBe("음식점");
    expect(c("korean_restaurant", "풍류정")).toBe("음식점");
    expect(c("cafe", "La Parisienne")).toBe("카페");
    expect(c("bar", "Rooftop")).toBe("술집");
    expect(c("hotel", "웰컴 호텔")).toBe("숙소");
    expect(c("lodging", "샹그릴라")).toBe("숙소");
  });
  it("이름에 사원·전망대 단서가 있어도 식당·숙소는 식당·숙소다", () => {
    expect(c("restaurant", "타워 레스토랑")).toBe("음식점");
    expect(c("hotel", "Sky Tower Hotel")).toBe("숙소");
  });
});

describe("courseSpotCategory — 이름 단서(타입이 관광지·기타일 때)", () => {
  it.each([
    ["tourist_attraction", "도쿄 타워", "전망대"],
    ["tourist_attraction", "쓰텐카쿠", "전망대"],
    ["point_of_interest", "도쿄 스카이트리", "전망대"],
    ["tourist_attraction", "힐튼 선착장", "선착장"],
    ["tourist_attraction", "Caohagan Island", "섬"],
    ["tourist_attraction", "탄중 아루 해변", "해변"],
    ["establishment", "Poin Reflexology Spa", "스파"],
    ["tourist_attraction", "산토니뇨 성당", "사원·성당"],
    ["point_of_interest", "센소지", "사원·성당"],
    ["point_of_interest", "불국사", "사원·성당"],
    ["point_of_interest", "신주쿠 교엔", "공원"],
    ["tourist_attraction", "오사카 성", "명소/유적"],
    ["point_of_interest", "경복궁", "명소/유적"],
    ["point_of_interest", "Godaime Wagyu Tokyo", "음식점"],
  ])("%s %s → %s", (category, name, expected) => {
    expect(c(category, name)).toBe(expected);
  });

  it("beach 플래그가 있으면 이름에 해변 단어가 없어도 해변", () => {
    expect(c("tourist_attraction", "Pulau Gaya", true)).toBe("해변");
  });

  it("그 외 tourist_attraction은 관광지, 단서가 정말 없을 때만 기타", () => {
    expect(c("tourist_attraction", "시장 거리")).toBe("관광지");
    expect(c("point_of_interest", "Something")).toBe("기타");
    expect(c("", "")).toBe("기타");
  });
});
