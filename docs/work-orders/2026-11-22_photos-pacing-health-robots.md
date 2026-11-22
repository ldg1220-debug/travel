# [Cowork 지시서] 사진(photos) 호출 경로별 계측·일일 페이싱 + 검증용 /api/health robots 허용

작성: 2026-11-22 · Cowork · 이슈 #381

## 0-1. 근거 (실측)
- photos 월 사용량(이슈 #354 기록): 11/03~07 83 → 11/08 170 → 11/09 276 → 11/11 395 → 11/12 448 → (11/12~17 정체 448) → 11/20 494 → 11/21 568 → 11/22 600 (freeLimit 1000의 60%, 상한 900의 67%).
- 새 글·새 코스 생성 없이도 늘어난다. 코드상 photos 를 쓰는 곳은 두 곳: `/api/places/photo`(검색 결과 photoName), `/api/discover/spot-photo`(이름+도시로 searchText 1회 + 사진 1회). spot-photo 는 홈 일정 카드, /discover 카드, 스크랩북 표지, 코스 만들기 후보 카드(CourseSpotCard — Kakao 국내 후보는 photoName 이 없어 후보마다 spot-photo)에서 쓴다.
- 캐시: CDN 캐시 1일, 이름→사진 메모는 lambda 메모리라 배포·콜드스타트 때 사라진다. 같은 장소라도 하루마다·배포마다 다시 과금된다.
- photos 는 `PACED_SKUS` 에 없어 하루 상한이 없고 `todayBySource` 경로별 분리도 없다. 월 90% 가드만 있어 닿으면 남은 기간 사진이 모두 사라진다.
- 검증 담당(Cowork)은 WebFetch 로 확인하는데 robots.txt 가 `/api/` 를 막아 `/api/health` 를 못 읽는다(11/22 2회 연속 실패).

## 1. 할 것
1. `photos` 를 `PACED_SKUS` 에 넣어 일 단위 페이싱(남은 한도/남은 날수)과 `todayBySource`(user:spot-photo / user:search 등)를 받게 한다. `/api/places/photo` 도 `runWithMapsRoute` 로 감싸 경로가 잡히게 한다(경로 이름은 기존 MapsUserRoute 중 맞는 것, 없으면 하나 추가).
2. spot-photo 호출을 화면별로 구분할 수 있게 `src` 쿼리에 `from=home|discover|scrapbook|course` 를 붙이고, 오늘 화면별 photos 호출 수를 health 에 노출한다(예: `maps.photosByScreenToday`). 캐시 키가 화면별로 갈라지지 않게 CDN 캐시는 q 기준으로 유지할 방법이 어려우면 health 계측만 하고 쿼리 추가는 생략해도 된다(★로 보고).
3. robots: `/api/health` 만 allow 에 추가하고, health 응답에 `X-Robots-Tag: noindex` 헤더를 붙인다(검색 색인 방지).

## 2. 확인할 것
- `/robots.txt` 에 `Allow: /api/health` 가 있고 `/api/` 차단은 그대로.
- `curl -sI https://www.tradule.co.kr/api/health` 에 `x-robots-tag: noindex`.
- health `maps.usage.photos` 에 todayLimit 와 todayBySource 가 나온다. 하루 상한 ≈ (900 − 이번 달 사용) / 남은 날수.
- tsc · eslint · vitest · next build 통과.

## 3. 하지 말 것
- COURSE_ALGO_VERSION 올리기 금지. 특정 호텔 추천 금지.
- CDN 캐시를 1일보다 길게 늘리지 않는다. 환경변수·Google Cloud 설정은 건드리지 않는다.
