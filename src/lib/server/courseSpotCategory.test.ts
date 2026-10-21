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
    ["point_of_interest", "불국사", "사원·성당"],
    ["point_of_interest", "해동용궁사", "사원·성당"],
    ["point_of_interest", "난바 야사카 신사", "사원·성당"],
    ["point_of_interest", "메이지 신궁", "사원·성당"],
    ["tourist_attraction", "Fushimi Inari Shrine", "사원·성당"],
    ["point_of_interest", "트리쉐이드", "스파"],
    ["point_of_interest", "Poin Reflexology", "스파"],
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

// 작업지시서 2026-10-12 "#305 검증" §2 — 이름 규칙 오탐.
describe("courseSpotCategory — 이름 규칙 오탐 방지", () => {
  it("신사이바시스지 상점가는 사원이 아니다(상점가·시장·거리·아케이드가 사원·스파 이름 규칙보다 우선)", () => {
    expect(c("point_of_interest", "신사이바시스지 상점가")).toBe("관광지");
    expect(c("tourist_attraction", "신사이바시스지")).not.toBe("사원·성당"); // "신사"는 이름 끝일 때만
    expect(c("point_of_interest", "도톤보리 거리")).toBe("관광지");
    expect(c("point_of_interest", "구로몬 시장")).toBe("관광지");
    expect(c("establishment", "Kuromon Market")).toBe("관광지");
    expect(c("establishment", "Arcade Street Spa")).toBe("관광지"); // 우선순위 — 스파 단어가 있어도 거리 이름이 우선
  });

  it("'…지'로 끝나는 이름만으로는 사원이 아니다 — 센소지는 primaryType(buddhist_temple)으로 사원", () => {
    expect(c("point_of_interest", "고분지")).toBe("기타");
    expect(c("buddhist_temple", "센소지")).toBe("사원·성당");
  });

  it("이름 끝 '…사'는 한글 2~4자 + 사만 — 긴 이름·영문 혼합은 오탐하지 않는다", () => {
    expect(c("point_of_interest", "불국사")).toBe("사원·성당");
    expect(c("point_of_interest", "경주 불국사")).toBe("사원·성당");
    expect(c("point_of_interest", "서울 출판사")).toBe("기타"); // 회사·출판사 등 기관 이름
    expect(c("point_of_interest", "코리아나 화장품 주식회사")).toBe("기타");
  });
});

// 작업지시서 2026-10-12 "#306 검증" §2 — 종일시설이면 종류도 테마파크(국내 Kakao 후보는 primaryType이 없다).
describe("courseSpotCategory — 종일시설은 테마파크", () => {
  it.each([
    ["관광명소", "롯데월드 어드벤처"],
    ["관광명소", "에버랜드"],
    ["문화시설", "서울랜드"],
    ["관광명소", "레고랜드 코리아 리조트"],
    ["tourist_attraction", "유니버설 스튜디오 재팬"],
    ["amusement_park", "도쿄 디즈니랜드"],
  ])("%s %s → 테마파크", (category, name) => {
    expect(c(category, name)).toBe("테마파크");
  });

  it("곁가지·수족관·동물원은 테마파크가 아니다 — 롯데월드타워·몰·아쿠아리움, 디즈니 스토어", () => {
    expect(c("관광명소", "롯데월드타워 서울스카이")).toBe("전망대");
    expect(c("shopping_mall", "롯데월드몰")).not.toBe("테마파크");
    expect(c("aquarium", "롯데월드 아쿠아리움")).toBe("수족관");
    expect(c("store", "디즈니 스토어")).not.toBe("테마파크");
  });

  it("리뷰 3만 이상 테마파크 타입도(사전에 없어도) 테마파크, 작은 테마파크 타입은 타입대로 테마파크", () => {
    expect(c("amusement_park", "어떤 놀이공원")).toBe("테마파크");
    expect(courseSpotCategory({ category: "amusement_park", name: "큰 놀이공원", reviewCount: 50000 })).toBe("테마파크");
  });
});

// 작업지시서 2026-10-13 "새 대표 일수 코스 점검" §1·§2·§4
describe("courseSpotCategory — 괌·치앙마이·덴포잔 (2026-10-13)", () => {
  it("디너쇼·식당은 섬·해변이 아니다", () => {
    expect(c("event_venue", "Fish Eye Island Cultural Dinner Show")).not.toBe("섬");
    expect(c("tourist_attraction", "Fish Eye Island Cultural Dinner Show")).not.toBe("섬");
    expect(c("restaurant", "괌 더비치 바 레스토랑")).toBe("음식점");
    expect(c("tourist_attraction", "괌 더비치 바 레스토랑")).not.toBe("해변");
  });
  it("이름이 해변으로 끝나면 park 이어도 해변 · 리티디안 포인트도 해변", () => {
    expect(c("park", "이파오 해변(스노클링)")).toBe("해변");
    expect(c("park", "탄중 리팟 해변")).toBe("해변");
    expect(c("park", "신주쿠 교엔")).toBe("공원");
    expect(c("nature_preserve", "리티디안 포인트")).toBe("해변");
  });
  it("USJ(event_venue)는 여전히 테마파크, 카오소이·대관람차는 음식점·전망대", () => {
    expect(c("event_venue", "유니버설 스튜디오 재팬")).toBe("테마파크");
    expect(c("establishment", "카오소이 매싸이")).toBe("음식점");
    expect(c("establishment", "덴포잔 대관람차")).toBe("전망대");
    expect(c("establishment", "Tempozan Ferris Wheel")).toBe("전망대");
  });
});

describe("courseSpotCategory — cafe 타입 레스토랑 (2026-10-13 #312 §4)", () => {
  it("cafe 여도 레스토랑 표지·by 셰프명이면 음식점, 카페 단어가 있으면 카페", () => {
    expect(c("cafe", "Polux by Paul Pairet")).toBe("음식점");
    expect(c("cafe", "Le Bistro")).toBe("음식점");
    expect(c("cafe", "Seaside Restaurant")).toBe("음식점");
    expect(c("cafe", "스타벅스 리저브")).toBe("카페");
    expect(c("cafe", "Blue Bottle Coffee by Kiyosumi")).toBe("카페");
    expect(c("cafe", "Pika's Cafe")).toBe("카페");
  });
});


// 작업지시서 2026-10-21 "3km 구간 대중교통 59분 · \"다리\"가 기타" §2②
describe("courseSpotCategory — 다리·대교·Bridge·Bashi 는 관광지(기타 금지)", () => {
  it.each(["고쿠라쿠바시 다리", "광안대교", "Tower Bridge", "도톤보리 에비스바시", "Nihonbashi Bashi", "日本橋"])("%s → 관광지", (name) => {
    expect(c("tourist_attraction", name)).toBe("관광지");
    expect(c("point_of_interest", name)).toBe("관광지");
  });
  it("음식 단어가 있으면 음식점으로 둔다(닭다리 식당) · 다리미 같은 단어는 다리가 아니다", () => {
    expect(c("restaurant", "닭다리 식당")).toBe("음식점");
    expect(c("point_of_interest", "다리미 박물관")).not.toBe("관광지");
  });
});
