/**
 * 코스 만들기 지역 타일의 고정 이미지 — 저장소 public/discover/spots/ 에 이미 있는 파일만 재사용한다.
 * 이슈 #441: 타일마다 /api/discover/spot-photo(Google Places 사진+텍스트검색)를 부르던 것을 없앴다.
 * 매핑에 없는 지역은 호출부가 그라데이션+핀 대체 화면을 보인다. 새 외부 이미지 추가 금지.
 */
import { getDiscoverSpotImage, type DiscoverSpotImage } from "./discoverSpotImages";

/** 1단계(국내/해외) 타일 — 국내 경복궁(d-f1), 해외 에펠탑(o-fr1). */
export const COURSE_SCOPE_TILE_IMAGE_IDS = { domestic: "d-f1", overseas: "o-fr1" } as const;

/** 지역 라벨 → discoverSpotImages 의 이미지 id (라벨만으로 매칭, 모호한 곳은 넣지 않는다). */
const LABEL_TO_IMAGE_ID: Record<string, string> = {
  // 국내 광역
  서울: "d-f1", 인천: "d-t13", 부산: "d-t12", 제주: "d-f2",
  // 전라=전주 한옥마을, 경상=경주 불국사 (경기·강원·충청은 맞는 이미지가 없어 제외)
  전라: "d-t8", 경상: "d-f5",
  // 해외 대륙 (아프리카·남미·오세아니아는 맞는 이미지가 없어 제외)
  // 아시아=도쿄 시부야(1단계 해외 o-fr1 과 겹치지 않게), 유럽=로마 콜로세움, 북미=뉴욕 타임스스퀘어
  아시아: "o-t5", 유럽: "o-it1", 북미: "o-us1",
  // 국내 시/군·동네
  송도: "d-t13", 전주: "d-t8", 통영: "d-t11", 경주: "d-f5", 광안리: "d-t12", 사하: "d-f4", 성산: "d-f2", 종로: "d-f1",
  // 해외 국가
  프랑스: "o-fr1", 이탈리아: "o-it1", 영국: "o-uk1", 일본: "o-t6", 미국: "o-us1", 스페인: "o-es1",
  태국: "o-th1", 대만: "o-tw1", 캐나다: "o-ca1", 베트남: "o-t12",
  // 해외 도시
  파리: "o-fr1", 로마: "o-it1", 런던: "o-uk1", 도쿄: "o-t5", 교토: "o-t6", 오사카: "o-t1", 방콕: "o-th1",
  타이베이: "o-tw1", 뉴욕: "o-us1", 샌프란시스코: "o-us4", 바르셀로나: "o-es1", 하노이: "o-f3", 다낭: "o-t9", 밴쿠버: "o-ca1", 하롱: "o-t12",
};

export function courseTileImage(label: string): DiscoverSpotImage | undefined {
  if (!Object.hasOwn(LABEL_TO_IMAGE_ID, label)) return undefined;
  return getDiscoverSpotImage({ id: LABEL_TO_IMAGE_ID[label] });
}

export function courseScopeTileImage(scope: "domestic" | "overseas"): DiscoverSpotImage | undefined {
  return getDiscoverSpotImage({ id: COURSE_SCOPE_TILE_IMAGE_IDS[scope] });
}
