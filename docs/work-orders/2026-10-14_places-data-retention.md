# 작업 지시서 — Google Places 데이터 보관 기간 점검 (약관 맞춤)

작성: 2026-10-14 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: Google Maps Platform Service Specific Terms §A-3, §B-14.3 (Cowork 원문 확인, 2026-06-10 개정본)
https://cloud.google.com/maps-platform/terms/maps-service-terms

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-14_places-data-retention.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 0-1. 배경 — 약관이 허용하는 보관

| Places API 에서 받은 값 | 보관 허용 |
|---|---|
| place_id | **무기한** |
| 위도·경도 (lat/lng) | **최대 30일**, 이후 삭제(또는 재조회로 갱신) |
| 그 밖의 모든 값 — 이름·평점·리뷰 수·주소·사진·영업시간·타입 등 | **보관 불가** (화면에 보여주는 건 OK, 장기 저장은 안 됨) |

트레쥴 화면에 평점을 보여주는 것 자체는 정상 사용입니다(출처 표기는 #317·#318 로 완료). 문제는 **DB·캐시에 얼마나 오래 들고 있느냐**입니다. 위반 시 API 키 정지 → 트레쥴 장소·지도 전체가 멈출 수 있어 점검합니다.

## 1. 먼저 보고할 것 (코드 변경 전에)

```
Places 응답에서 온 값을 저장하는 곳을 전부 표로:
  저장 위치(테이블/키/파일/Blob/CDN) · 저장 필드 · 실제 수명(TTL·갱신 주기) · 갱신 안 되면 얼마나 남는지
예상 대상:
  - course-brief 캐시 (COURSE_ALGO_VERSION 키) — spots[].name/rating/reviewCount/lat/lng
  - course-map-input:{지역}:{일수} (#314, 버전 무관 — 오래 남을 수 있음) — 스팟 좌표
  - 지역 스냅샷 / 장소 후보 풀 / discover 큐레이션 데이터
  - 사이트맵·정적 생성(ISR) 페이지 HTML 안의 평점
  - src/data/*.json 등 저장소에 커밋된 장소 데이터
```

## 2. 맞출 기준 (보고 후 진행)

```
① 장기 보관은 place_id 만. 이름·평점·리뷰 수 등은 TTL 을 두고 만료 시 재조회
   권장 TTL: 평점·리뷰 수·이름 등 24~26시간 이내 (현재 크론 주기 활용)
② lat/lng: 저장 시각 기록 → 30일 넘으면 삭제 또는 place_id 로 재조회해 갱신
   course-map-input 도 30일 만료 (만료 후 첫 요청 때 재생성)
③ 저장소에 커밋된 Google 유래 데이터(이름·평점·좌표)가 있으면 place_id 만 남기는 구조로
④ 비용: 재조회가 늘면 Places 호출 비용이 늘 수 있음 — 예상 월 호출 수를 같이 보고
   (Place Details 필드 마스크를 rating·userRatingCount·displayName·location 최소로)
```

## 3. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | §1 저장 위치·수명 표 보고 | 소 · **최우선** |
| 2 | §2 ①② TTL·30일 만료 | 소~중 |
| 3 | §2 ③④ | 보고 결과에 따라 |

## 4. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| 저장 위치 표 | 모든 Places 유래 필드의 수명이 약관 범위 안 |
| course-brief | 평점 값이 하루 이내로 갱신 (응답에 조회 시각 필드가 있으면 확인) |

---

## 처리 결과

### §1 Places 유래 값 저장 위치 (변경 전 → 변경 후)

| 저장 위치 | 저장 필드(Places 유래) | 변경 전 수명 | 변경 후 |
|---|---|---|---|
| `place_candidate_cache` 후보 풀 `overseas:/domestic:{도시}:{슬롯}` | Place[] — 이름·평점·리뷰 수·주소·타입·좌표·사진 참조 | 읽기 7일 / 물리 삭제는 쓰기 시 5% 확률로 30일 초과분만 → 최대 30일+ | 읽기 26h, 크론 끝에 28h 초과분 삭제 |
| 같은 테이블 최종 브리프 `content-brief:{scope}:{지역}:{일수}:v{N}` | spots[] 이름·평점·리뷰 수·좌표·mapPaths(Directions 폴리라인) | 읽기 26h, 하지만 지난 버전(v1~v39) 행은 안 지워짐(30일 확률 청소뿐). 사이트맵/허브 요약은 **14일** 된 행까지 사용 | 읽기 26h, 28h 초과 삭제. 사이트맵/허브 요약(info: 대표 장소 이름 등)도 26h 이내 행만 |
| 평점 보강 `content-brief-rating:{지역}:{이름}` | 평점·리뷰 수 | 읽기 30일 | 읽기 26h, 28h 초과 삭제 |
| 지도 입력 `course-map-input:{지역}:{일수}` (#314) | 스팟 좌표·경로선(폴리라인)·일자 묶음 | **읽기 TTL 없음**, 쓰기 때마다 갱신(최대 30일 확률 청소) | 읽기 30일 초과 시 없는 것으로 취급 → 코스 재생성, 크론이 30일 초과 삭제 |
| 사이트맵 기록 `course-sitemap:{지역}:{일수}` | 지역·일수만(Places 값 없음) | 30일 | 변경 없음 |
| `spot_place_metrics` (월 1회 크론) | place_id + 평점·리뷰 수·가격대·영업시간 | 읽기 30일 컷, 로우는 안 지움 | **미변경** — 아래 "남은 결정" |
| CDN `Cache-Control` | `/api/places/details`(평점·리뷰·사진 이름) s-maxage 1일, `/api/discover/spot-photo`(사진 참조) **7일** | 7일 | spot-photo 1일로 단축. `course-map` PNG 30일은 지도 이미지(아래 메모) |
| 메모리 `photoNameMemo` (spot-photo, 람다 인스턴스) | 장소 검색어 → 사진 참조 | 인스턴스 수명(무제한, 2,000건 상한) | **미변경**(보고) |
| 코드에 커밋된 `src/lib/discoverData.ts` | 큐레이션 스팟 이름·좌표·평점(rating ~65곳)·리뷰 수·placeId(67곳) | 영구 | **미변경** — 아래 "남은 결정" |
| 사용자 데이터: `itineraries.placesData`·`itinerary_revisions`·`trip_posts` 스냅샷·`reviews.placeName`·localStorage 일정 | placeId + 이름 + 좌표(+ 예산) — 사용자가 직접 담은 일정/후기 | 영구 | **미변경** — 아래 "남은 결정" |
| `transit_routes` | place_id 쌍 + 소요 시간(분) | 영구 | 현재 사용처 없음(스키마만) |

### 변경한 것 (§2 ①②)
- `placesRetention.ts`: 상수(콘텐츠 26h · 좌표 30일 · 물리 삭제 +2h 유예)와 `purgeExpiredPlacesCache()` — 워밍 크론 끝에서 호출(결과 `purged`, 로그 `places cache purge`). +2h 유예는 크론 순번(pickStaleTasks)이 행의 created_at 에 의존해서.
- 후보 풀 TTL 7일→26h, 평점 보강 TTL 30일→26h, 사이트맵/허브 요약 14일→26h, course-map-input 읽기 30일 만료, spot-photo CDN 7일→1일.

### 비용 영향 (④, 추정)
- 후보 풀이 주 1회→일 1회로 재검색 → 워밍 크론이 하루 처리하는 지역(우선 24 + 일반, 서로 다른 지역 약 20곳) × 슬롯 약 8~12개 ≈ 하루 200~250 Text Search ≈ 월 6,000~7,500회(이전 약 800~1,000회 추정). Text Search(Pro/Enterprise 티어)·평점 필드(Enterprise) 요금은 Cowork 가 콘솔 청구에서 확인 필요. 사용자 직접 요청분은 별도.
- 평점 보강(국내 Kakao 스팟 Text Search)도 30일→26h 로 호출 증가(국내 코스 조회 빈도에 비례).

### 남은 결정 (동근님)
1. `spot_place_metrics`(/discover 큐레이션 지표): 월 1회 크론 + 30일 컷이라 약관(평점 보관 불가, 화면 표시용 단기 캐시만)과 맞지 않음. 26h 로 맞추려면 매일 Place Details(Enterprise, 월 무료 1,000회 — 398곳×30일 ≈ 12,000회)가 필요해 비용이 큼. 대안: /discover 카드의 지표를 요청 시 조회 + 26h 캐시, 또는 지표 비표시.
2. `discoverData.ts` 의 이름·좌표·평점은 큐레이션 편집 데이터로 오래 사용 중 — place_id 만 남기고 런타임에 조회하는 구조로 바꾸면 대규모 변경(카드 렌더링·검색이 이름/좌표에 의존).
3. 사용자 일정/후기의 이름·좌표 저장: 사용자가 직접 선택한 계획 데이터라 별도 판단이 필요(place_id 만 저장하고 열 때 조회하려면 제품 전체에 영향).
4. 메모: course-map PNG 의 CDN 30일 캐시와 과거 Blob 저장은 Static Maps 이미지 캐시이며 Places 값은 아니지만, 지도 이미지 캐시 정책은 Maps 약관 별도 항목이라 확인 필요. `COURSE_ALGO_VERSION` 은 올리지 않음(40 유지).
