# 작업 지시서 — 색인 코스 JSON-LD 장소 유형 바로잡기

작성: 2026-11-26 · Cowork

## 0-1. 근거 (2026-11-26 08시 KST 실측)
- 색인 코스 12개 페이지의 `TouristTrip.itinerary` 항목 165개가 모두 `"@type": "TouristAttraction"` 이다(`src/lib/coursePages.ts` `buildCourseItemListJsonLd`).
- 그중 `음식점.`·`카페.` 로 나오는 장소가 56개(34%).
- 각 스팟에는 이미 한글 종류(`spot.category`)가 있어 추가 API 호출 없이 고칠 수 있다.

## 1. 할 것
1. `buildCourseItemListJsonLd` 에서 `spot.category` 로 유형을 고른다: `음식점`→`Restaurant`, `카페`→`CafeOrCoffeeShop`, `술집`→`BarOrPub`, `숙소`→`LodgingBusiness`, 그 밖→`TouristAttraction`.
2. `aggregateRating`·`review`·평점·리뷰 수는 넣지 않는다(2026-10-13 주석 유지). name·geo 만 그대로.
3. 테스트: 유형별 매핑, aggregateRating·review 키 없음, position·geo 유지.

## 2. 확인할 것
- tsc · eslint · vitest · next build 통과.
- 배포 뒤 `/course/제주/2박3일` ld+json 에서 `슌식당`=`Restaurant`, `섭지코지`=`TouristAttraction`.
- 12개 페이지 200 유지, `/api/health` `courseBuild.versionProgress` 12/12 유지.

## 3. 하지 말 것
- `COURSE_ALGO_VERSION` 올리기 · 특정 호텔 추천 · 비밀값/환경변수/`claude.yml` 변경 · 워밍 횟수·색인 코스 수 증가.
- 평점·리뷰·가격대·주소 등 Google 콘텐츠 추가 금지. 코스 구성·식당 수 조정 범위 밖.
