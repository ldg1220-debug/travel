# 작업 지시서 — 긴급: #319 이후 Places 호출 비용 — 무료 한도 안으로 막는 가드

작성: 2026-10-14 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: #319(`732b032`) 보고의 호출 추정 + Google Maps Platform 가격표(2026-10-08 갱신, Cowork 원문 확인)
https://developers.google.com/maps/billing-and-pricing/pricing

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-14_places-cost-guard.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 0-1. 배경

#319 로 후보 풀이 하루 1회 재조회가 되어 Text Search 가 월 800~1,000 → **6,000~7,500회**(추정)로 늘어납니다.
Places API (New) 는 요청 필드에 따라 SKU 가 갈립니다. **rating · userRatingCount 를 받으면 Enterprise** 입니다.

| SKU | 월 무료 | 초과 1,000건당 |
|---|---|---|
| Text Search Essentials (IDs Only) | 무제한 | - |
| Text Search Pro | 5,000 | $32 |
| **Text Search Enterprise** (평점 포함) | **1,000** | **$35** |
| Place Details Essentials (IDs Only) | 무제한 | - |
| Place Details Pro | 5,000 | $17 |
| **Place Details Enterprise** (평점 포함) | **1,000** | **$20** |
| Place Details Photos | 1,000 | $7 |
| Static Maps | 10,000 | $2 |
| Routes Compute Routes Essentials | 10,000 | $5 |

후보 검색이 Enterprise 라면 월 7,000회 ≈ **$210/월**. 동근님 결정: **비용 업그레이드 없이 무료 유지.** 약관(평점 26시간)도 지키고 무료도 지키려면, 한도를 넘으면 "옛 값을 쓰는" 게 아니라 **"평점 없이 보여주는"** 쪽으로 갑니다.

## 1. 먼저 보고할 것

```
Places/Maps 를 부르는 모든 호출 지점 표:
  호출 위치 · API(Text Search/Details/Photos/Nearby/Routes/Static) · fieldMask · 해당 SKU(Essentials/Pro/Enterprise) · 지난 30일 추정 호출 수 · #319 이후 추정
```

## 2. 할 것

```
① 월 예산 가드 (blobBudget 와 같은 방식) — src/lib/server/mapsBudget.ts
   DB 카운터 maps-ops:{SKU}:YYYY-MM, 호출 직전 +1
   상한 = 월 무료 한도의 90% (Enterprise 900 · Pro 4,500 · Photos 900 · Static 9,000 · Routes 9,000)
   상한 도달 시 그 SKU 호출 안 함 → 동작:
     후보 검색: Essentials(IDs Only, 무료) 또는 Pro 로 내려 검색 · 평점 없이 코스 생성 (rating null → 화면 "평점 정보 없음")
     평점 보강/Details: 건너뜀 (평점 없이)
     사진: 플레이스홀더
     Static Maps: 지도 없이 (imageUrl null)
   로그 [mapsBudget] sku= count= limit= action=skip
   /api/health 에 SKU 별 이번 달 사용량 추가
② 필드 마스크 최소화
   평점이 필요 없는 검색은 Essentials(IDs Only)/Pro 필드만 — Enterprise 는 평점을 실제로 보여줄 때만
③ 워밍 크론 축소
   매일 20지역 일괄 재조회 → "최근 26시간 안에 방문(코스 페이지·course-brief 요청)된 지역"만 갱신, 하루 상한 N(설정값, 기본 5)
   방문 없는 지역은 만료된 채로 두고, 다음 첫 요청 때 생성 (가드 안에서)
④ 남은 결정 3건 — 아래 기본안으로 진행
   spot_place_metrics: 월 크론 중지 → 카드가 보일 때 요청 시 조회 + 26시간 캐시 (가드 안에서, 한도 초과면 지표 숨김)
   discoverData.ts: 커밋된 rating·reviewCount 삭제(런타임 조회·가드 안). 이름·좌표·placeId 는 유지(이번 범위 밖)
   사용자 저장 일정·후기: 변경 없음 (사용자 본인 데이터)
```

## 3. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | §1 호출 지점·SKU 표 | 소 · **최우선** |
| 2 | ① 예산 가드 + ② 필드 마스크 | 소~중 · 같이 |
| 3 | ③ 크론 축소 | 소 |
| 4 | ④ | 소 |

`COURSE_ALGO_VERSION` 은 평점 null 처리로 코스 결과가 달라지면 +1.

## 4. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| /api/health | SKU 별 이번 달 사용량 · 한도 |
| course-brief (평소) | 평점 정상 |
| 가드 테스트(한도 0 으로 설정한 테스트) | 평점 null · 화면 "평점 정보 없음" · 호출 0 |
| 한 달 뒤 Google Cloud 청구 | Places/Maps 청구 $0 |

---

## 처리 결과

### §1 Places/Maps 호출 지점 · SKU 표
(30일 실측 로그가 이 세션에 없어 "30일 추정"은 코드 구조 기준 추정이다. 정확한 값은 Cloud 콘솔 청구/지표로 확인 필요)

| 호출 위치 | API | 필드 마스크 | SKU | 변경 전 월 추정 | #319 후 추정 → 지금 |
|---|---|---|---|---|---|
| `courseRecommend.googleTop` (후보 풀 · 평점 보강 · 랜드마크) | Text Search | places.id,displayName,formattedAddress,location,**rating,userRatingCount**,primaryType,photos,googleMapsUri | **Enterprise** | 후보 풀 TTL 7일 → ~1,000 | ~6,000~7,500 → 가드 900 + 워밍 하루 5조합 |
| `api/places/search` `rawGoogleSearch` · `fetchGooglePlacesPage` (사용자 검색) | Text Search | 위 + priceLevel | **Enterprise** | 사용자 검색량 비례 | 가드 안 |
| `api/places/search` `searchByPlaceId` | Place Details | id,displayName,…,rating,userRatingCount,priceLevel,… | **Enterprise** | 지도 POI 클릭 수 | 가드 안 |
| `api/places/details` 상세 | Place Details | photos,reviews,rating,userRatingCount,currentOpeningHours.openNow | **Enterprise** | 장소 상세 열람 수 | 가드 안(강등 시 사진만) |
| `api/places/details` `resolvePlaceId` | Text Search | places.id | **IDs Only(무료)** | — | 변경 없음 |
| `api/discover/spot-photo` 검색 | Text Search | places.photos | Pro | /discover 카드 수 | Pro 가드(4,500) |
| `api/discover/spot-photo` · `api/places/photo` | Place Photos | — | Photos(무료 1,000) | 카드·상세 수 | 가드 900 |
| `cron/refresh-spot-metrics` (삭제) → `getSpotMetrics.refreshStaleSpotMetrics` | Place Details | rating,userRatingCount,priceLevel | **Enterprise** | 월 1회 최대 398 | 요청 시 요청당 5개 · 가드 900 |
| `server/pipeline/placesMapping` | Text Search | places.id,displayName,location,rating | **Enterprise** | 파이프라인 실행 시 | 가드 안 |
| `courseBrief.fetchGoogleDirectionsRoute` | Directions(legacy) | — | Routes 무료 10,000 | 코스 빌드당 구간 수 | 가드 9,000(닿으면 직선 추정) |
| `courseBrief.renderCourseMapPng` · `planMapImage` | Static Maps | — | Static 무료 10,000 | CDN MISS 수 | 가드 9,000(닿으면 지도 없음) |
| 브라우저 Maps JavaScript(MapProvider) | Maps JS | — | 로드당 과금(별도 SKU) | — | **미변경**(이 지시서 범위 밖) |

### 변경 (§2)
- ① `mapsBudget.ts`: `maps-ops:{sku}:YYYY-MM` DB 카운터(호출 직전 원자적 +1, 한도에 닿으면 증가 없이 거절·`[mapsBudget] sku= count= limit= action=skip` 로그). 상한 = 무료 한도의 90%(Enterprise 900 · Pro 4,500 · Photos 900 · Static 9,000 · Routes 9,000). `MAPS_BUDGET_OVERRIDE='{"text-enterprise":0}'` 로 SKU 별 상한을 덮어써 가드를 시험할 수 있다. `/api/health` 에 `maps` 로 SKU 별 `count/limit/freeLimit`.
- ② `chooseGuardedMask`: Enterprise 필드(rating · userRatingCount · priceLevel · 영업시간 · 리뷰)가 든 마스크는 Enterprise 한도에 닿으면 그 필드만 빼 Pro 로 강등(평점 없이), Pro 한도도 닿으면 호출 안 함. IDs Only 는 무료라 가드 없음. 사진·Static·Routes 는 단순 한도.
- `ratingsUnavailable`: 평점 없는 스팟이 절반 이상이고 Enterprise 한도에 닿아 있으면 브리프에 표시 → 코스 페이지·사이트맵 기록이 "평점 없음"을 이유로 404/제외하지 않는다(월말까지 페이지가 사라지지 않도록). 화면은 "평점 정보 없음".
- ③ 워밍 크론: 우선 풀·일반 풀 삭제. `course-visit:{지역}:{일수}`(코스 페이지·course-brief 요청이 기록, 10분 throttle)로 최근 26시간 방문된 조합만, 캐시가 20시간 넘게 묵은(또는 없는) 것부터 하루 `WARM_DAILY_MAX`(기본 5)개 갱신.
- ④ `spot_place_metrics`: 월 크론(`vercel.json`)과 `/api/cron/refresh-spot-metrics` 삭제 → `/api/discover/spot-metrics` 요청 시 26시간 지난 지표를 요청당 5개까지(가드 안) 새로 조회, 26시간 안 지표만 반환, 28시간 넘은 행 삭제. `discoverData.ts` 의 rating·reviewCount 65곳 삭제(이름·좌표·placeId 유지). 사용자 저장 일정·후기 변경 없음.
- `COURSE_ALGO_VERSION` 40 유지: 평소 코스 결과는 같다. 한도 초과 시에만 평점 null 코스가 나가며 그 코스는 26시간 캐시.

### 한계 · 주의
- 월 Enterprise 900회 ≈ 코스 빌드 90건(슬롯 10회 기준)에 불과하다. 하루 5조합 워밍 + 사용자 직접 요청이면 월중에 Enterprise 한도에 닿고, 이후엔 평점 없는 코스(캐시 26시간)가 나간다 — 의도한 동작이지만 평점이 없는 날이 꽤 길 수 있다.
- 사이트맵은 워밍이 아니라 방문(크롤러 포함)으로 새 조합이 확인되므로, 방문이 없는 조합은 늘지 않는다.
- /discover 지표는 카드가 마운트될 때 오래된 5개만 갱신해 대부분 카드는 평점 없이 보일 수 있다.
