# Google API 사용처

트레쥴이 쓰는 Google Maps Platform API 를 한 곳에 고정한 문서다. 프로젝트를 합치거나 키를 바꿀 때 이 문서를 먼저 본다.
**키 값은 절대 적지 않는다(변수 이름만).** Google API 호출을 추가·변경하는 PR 은 이 문서도 같이 고친다(PR 템플릿 체크박스).

> 작성: 2026-10-14 (작업지시서 "Google API 사용처 문서화"). 아래 "프로젝트" 열과 콘솔 수치는 Cloud 콘솔(Cowork 확인, 30일 9/14~10/14)에서 온 것이고, "환경 변수 ↔ 프로젝트" 연결은 어떤 API 를 어떤 키가 부르는지에서 **추정**한 것이다(Vercel 환경 변수/콘솔에서 확인 필요).

## A. 프로젝트 ↔ API ↔ 환경 변수 ↔ 콘솔 상한

| Cloud 프로젝트 | 켜져 있고 쓰이는 API | 30일 사용(콘솔) | 환경 변수(키 이름) | 콘솔 하루 상한 |
|---|---|---|---|---|
| `travel` (travel-501205) | Directions API (legacy) | 5,092 (오류 848 ≈ 17%) | `GOOGLE_MAPS_SERVER_KEY` (서버, 애플리케이션 제한 없음 · API 제한은 코드 주석 기준 Maps Static + Directions — 현재 설정은 콘솔 확인) | 확인 필요 |
| 〃 | Maps Static API | 2,366 | `GOOGLE_MAPS_SERVER_KEY` | 확인 필요 |
| 〃 | Maps JavaScript API | 56 | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (브라우저 노출 — HTTP 리퍼러 제한) | 확인 필요 |
| 〃 | Places API (legacy) | 7 | (아래 "legacy 7건" 참고) | — |
| `TRAVEL` (splendid-flow-501212-p3) | Places API (New) — Text Search · Place Details · Photos | 244 | `GOOGLE_PLACES_API_KEY` (서버) | Text Search 100/일 · Place Details(GetPlace) 100/일 (2026-10-14 기준; SKU 와 무관하게 합산) · 결제 계정 연결됨 |
| `TRAVEL` (travel-501212) · bom Project | 사용 없음 | 0 | — | — |

- 로그인용 `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` 은 Google OAuth(로그인)이며 Maps Platform API 가 아니다 — 이 문서의 대상 밖.
- 서버 라우트 다수가 `GOOGLE_PLACES_API_KEY || NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 로 폴백한다. `GOOGLE_PLACES_API_KEY` 가 설정돼 있으면 폴백은 쓰이지 않는다. 폴백 키(브라우저용, 리퍼러 제한)를 서버에서 쓰면 리퍼러가 없어 403 이 나므로 `GOOGLE_PLACES_API_KEY` 는 항상 설정해 둔다.
- 푸시(`fcm.googleapis.com`)는 Web Push 엔드포인트 허용 목록일 뿐 Google API 키를 쓰지 않는다.

## B. 호출 지점 ↔ API ↔ SKU ↔ 키 ↔ 가드 ↔ 한도 시 동작

월 무료 한도·가드는 `src/lib/server/mapsBudget.ts`(DB 카운터 `maps-ops:{sku}:YYYY-MM`, 호출 직전 +1, 상한 = 무료 한도의 90%). 현재 사용량은 `GET /api/health` 의 `maps`(SKU 별 `count/limit/freeLimit`, Enterprise 는 `todayCount/todayLimit` 포함). 가드 시험은 환경 변수 `MAPS_BUDGET_OVERRIDE='{"text-enterprise":0}'`.

2026-10-20 변경(작업지시서 "평점은 장소를 눌렀을 때만"): **코스(목록·페이지·course-brief)는 평점을 쓰지 않는다.** 코스 후보 검색(`googleTop`·파이프라인)은 Pro 필드만 받아 Enterprise(`text-enterprise`) 호출이 사라졌고, /discover 카드 지표 갱신(`refreshStaleSpotMetrics`, Place Details Enterprise)도 없앴다. 평점·사진·리뷰는 사용자가 장소를 눌렀을 때 `app/api/places/details/route.ts` 한 곳(`details-enterprise`, 클릭당 1회)에서만 받는다. `text-enterprise` 는 사용자 장소 검색(`app/api/places/search/route.ts`)만 남는다.

2026-10-21 (작업지시서 "#333 검증"): **검색 로봇(User-Agent 이름 목록 — `lib/botUserAgent.ts`)은 방문 기록·백그라운드 재생성·워밍 대상 선정에 쓰이지 않고**, 캐시(직전 버전 포함)가 있으면 그대로 받고 없으면 만들지 않고 503 이다. 페이싱 SKU 의 오늘 호출 수는 출처별(`user` · `warm` · `rebuild`)로 `/api/health` 의 `todayBySource` 에 나온다(`rebuild` = 사용자 방문이 응답 뒤 일으킨 새 버전 재생성, 워밍과 같은 50% 몫). 로그 `[course-brief] source=bot|user|warm|rebuild`.

2026-10-15 보강(작업지시서 "평점 검색(Enterprise) 하루 만에 243/900"):
- **일 단위 페이싱**(Enterprise 두 SKU + `text-pro` — 2026-10-20 "#331 검증": 코스 후보가 Pro 로 옮겨 오며 하루 300 이 이어지면 월 4,500 이 월말 전에 바닥난다): 오늘 상한 = `floor((월 상한 − 오늘 이전 사용) / 남은 날수)`, 최소 10(예: 10/15 → (900−243)/17 ≈ 38). 사용자 요청은 오늘 상한까지, **워밍 크론은 오늘 상한의 50%까지**. 로그 `[mapsBudget] … action=pacing`.
- **Google 이 실제 처리한 호출(2xx)만 센다**: 429/5xx/타임아웃/4xx 는 예약을 되돌린다(`settleGuarded`). 429(RESOURCE_EXHAUSTED = 콘솔 하루 상한 도달)는 그 SKU 의 오늘 남은 호출을 건너뛰게 표시한다(`maps-429:{sku}:{날짜}`, 로그 `action=quota429`).
- **콘솔 하루 상한 집계**(작업지시서 2026-10-16): Text Search 는 SKU(Enterprise/Pro/IDs Only)와 무관하게 콘솔의 `SearchTextRequest per day`, Place Details 는 `GetPlaceRequest per day` 를 나눠 쓴다. 가드는 이를 `text-search-all` / `get-place-all` 일 카운터(IDs Only 포함)로 합산해 **콘솔 상한(환경 변수 `GOOGLE_TEXT_SEARCH_DAILY_QUOTA` · `GOOGLE_GET_PLACE_DAILY_QUOTA`, 기본 100) × 0.9** 에 닿으면 Google 을 부르지 않는다(워밍은 그 절반까지). 콘솔 상한을 바꾸면 이 환경 변수를 같이 바꾼다. 일·월 카운터와 429 표시의 날짜는 **America/Los_Angeles** 기준이다 — Google 의 하루는 태평양 시간 자정(KST 16:00, 서머타임이 끝나면 17:00)에 리셋된다. `/api/health` `maps.textSearchAll` · `maps.getPlaceAll` 에 `todayCount/todayLimit/quota/quota429/quotaResetAt(Kst)`.
- **후보 풀은 지역 단위 1벌**: 캐시 키에 일수가 없어 한 지역의 모든 일수 코스가 같은 풀을 쓴다(26시간). 한 지역 빌드의 Text Search ≈ 슬롯 7(휴양형 3) + 3일차 이후 식당 슬롯 동의어 2(휴양형 1) + 랜드마크 1(휴양형 3) ≈ 10회(예전 21~22회).
- **워밍 크론**: 단위가 "조합 5개"에서 "지역 2개"(`WARM_DAILY_MAX`)로 — 최근 26시간 방문된 지역의 만료 임박 일수를 모두 같은 풀로 만든다.

| 호출 지점 (파일 · 함수) | API | 필드 마스크 / 요청 | SKU | 키(환경 변수) | mapsBudget 상한(무료×0.9) | 한도 시 동작 |
|---|---|---|---|---|---|---|
| `lib/server/courseRecommend.ts` `googleTop` (코스 후보 풀 · 랜드마크 · 동의어 풀) | Places New Text Search | id, displayName, formattedAddress, location, primaryType, types, businessStatus, photos, googleMapsUri (**평점 필드 없음** — 2026-10-20 "평점은 장소를 눌렀을 때만") | **Pro** | `GOOGLE_PLACES_API_KEY` (폴백 `NEXT_PUBLIC_…`) | `text-pro` 4,500 (**일 페이싱** `floor((4500−월 사용)/남은 날)`, 워밍 50% + 콘솔 하루 상한 `text-search-all`) | Pro 한도에 닿으면 검색 건너뜀(캐시된 풀·직전 버전 브리프로 서빙) |
| `app/api/places/search/route.ts` `rawGoogleSearch` · `fetchGooglePlacesPage` (사용자 장소 검색) | Places New Text Search | 위 + priceLevel (+ nextPageToken) | **Enterprise** | 〃 | `text-enterprise` 900 | 강등(평점 없이) → 건너뜀 |
| 〃 `searchByPlaceId` (지도 POI 클릭) | Places New Place Details | id, displayName, …, rating, userRatingCount, priceLevel, photos, googleMapsUri | **Enterprise** | 〃 | `details-enterprise` 900 | 강등 → 빈 결과 |
| `app/api/places/details/route.ts` (장소 상세) | Places New Place Details | photos, reviews(작성자 이름·프로필 사진 uri·원문 링크 포함), rating, userRatingCount, currentOpeningHours.openNow, formattedAddress, googleMapsUri | **Enterprise** | 〃 | `details-enterprise` 900 | 강등(사진만) → 빈 상세 |
| 〃 `resolvePlaceId` | Places New Text Search | places.id | IDs Only(무료) | 〃 | 가드 없음 | — |
| `app/api/discover/spot-photo/route.ts` 검색 | Places New Text Search | places.photos | Pro | 〃 | `text-pro` 4,500 | 사진 없음(플레이스홀더, 10분 캐시) |
| 〃 · `app/api/places/photo/route.ts` | Places New Photos(media) | maxWidthPx | Photos(무료 1,000) | 〃 | `photos` 900 | 사진 없음(404) |
| `server/pipeline/placesMapping.ts` | Places New Text Search | places.id, displayName, location (평점 없음) | **Pro** | `GOOGLE_PLACES_API_KEY` | `text-pro` 4,500 | 해석 실패(null) |
| `scripts/match-spot-place-ids.ts` (오프라인 스크립트) | Places New Text Search | (스크립트 내부) | Pro 이상 | `GOOGLE_PLACES_API_KEY` | 가드 없음(수동 실행) | — |
| `lib/server/courseBrief.ts` `fetchGoogleDirectionsRoute` (해외 도보·대중교통 구간) | Directions API (legacy) | origin · destination · mode | Routes(무료 10,000) | `GOOGLE_MAPS_SERVER_KEY` | `routes` 9,000 | 직선 추정으로 폴백 |
| `lib/server/courseBrief.ts` `renderCourseMapPng` (`/api/content/course-map`, CDN 미스 때만) | Maps Static | markers · path · center/zoom | Static(무료 10,000) | `GOOGLE_MAPS_SERVER_KEY` | `static` 9,000 | 지도 없음(imageUrl null · 렌더 502) |
| `lib/server/planMapImage.ts` `renderPlanMapPng` (`/api/og/plan`) | Maps Static | 〃 | Static | `GOOGLE_MAPS_SERVER_KEY` | `static` 9,000 | 사이트 기본 og 이미지로 302 |
| `lib/maps/google-map.ts` · `app/(app)/planner/MapProvider.tsx` (브라우저) | Maps JavaScript (`libraries=places`) | 지도 로드 | Maps JS(로드당 과금) | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 가드 없음(브라우저) | 지도 영역에 "Failed to load Google Maps" |

Directions 외 `kakaomobility` 길찾기(국내 자동차)·Kakao Local 검색은 Google 이 아니다.

### 코드로 확인한 것
- **Places API (legacy) 7건**: 서버·스크립트에서 legacy 엔드포인트(`/maps/api/place/…`)를 부르는 코드는 없다(전체 검색으로 확인). 클라이언트에도 `PlacesService` 호출은 없고(`PlannerBoard.tsx` 의 언급은 주석), `google.maps.places.Place`(New)만 `placeAdapters.ts` 타입으로 쓴다. 그러므로 7건은 브라우저 Maps JS 가 `libraries=places` 와 지도의 POI 아이콘을 다루며 내부적으로 부르는 호출로 **추정**한다(미검증). 지도 POI 클릭은 `PlannerGoogleMap.tsx` 가 `stop()` 으로 기본 정보창을 막고 `/api/places/search?placeId=` 로 대신 조회한다.
- **Directions 오류 848건(≈17%) 원인 추정(미검증)**: 호출 지점은 `fetchGoogleDirectionsRoute` 한 곳(해외 도보·대중교통, 대중교통 실패 시 자동차 재시도). 후보 원인 — ① 대중교통/도보가 없는 구간(`ZERO_RESULTS`/`NOT_FOUND` 는 HTTP 200 이라 콘솔 오류가 아닐 가능성), ② 키 제한(`REQUEST_DENIED` — API 제한에 Directions 누락 등), ③ 동시 호출 폭주로 `OVER_QUERY_LIMIT`, ④ 타임아웃(`ROUTE_CALL_TIMEOUT_MS`)으로 `REQUEST_FAILED`. 확정을 위해 이제 호출마다 `[directions] status=<OK|ZERO_RESULTS|NOT_FOUND|OVER_QUERY_LIMIT|REQUEST_DENIED|http_NNN|REQUEST_FAILED> mode=<walking|transit|driving>` 한 줄을 남긴다 — Vercel 로그에서 status 별로 세면 분포가 나온다.

## C. 프로젝트 통합 체크리스트 (API 를 다른 프로젝트로 옮길 때)

1. 옮길 프로젝트에서 **API 사용 설정**: Places API (New) · Directions API · Maps Static API · Maps JavaScript API (+ 결제 계정 연결).
2. **새 키 생성 + 제한**
   - 서버 키 2종 분리 권장: `GOOGLE_PLACES_API_KEY`(API 제한: Places API (New), 애플리케이션 제한: 없음 또는 Vercel egress 가 고정이면 IP) · `GOOGLE_MAPS_SERVER_KEY`(API 제한: Maps Static + Directions, 애플리케이션 제한 없음 — 서버 호출은 리퍼러가 없다).
   - 브라우저 키 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: API 제한 Maps JavaScript(+ Places 라이브러리를 쓰면 Places API (New)), **HTTP 리퍼러 제한**(`https://www.tradule.co.kr/*` 등).
3. **Vercel 환경 변수**(Production/Preview) 교체 후 재배포 — 위 변수 이름만 쓴다. 폴백 때문에 `GOOGLE_PLACES_API_KEY` 가 비어 있으면 브라우저 키가 서버에서 쓰여 403 이 난다.
4. **콘솔 하루 상한(quota)** 재설정: Places New Text Search/Get Place 는 `mapsBudget` 월 상한(Enterprise 900)과 어긋나지 않게 — 하루 상한이 100 이면 하루 동안의 버스트(워밍 5조합 × 슬롯 ≈ 50 + 사용자 검색)가 상한에 닿을 수 있다. Directions/Static 상한도 지정.
5. **결제 계정**: 새 프로젝트에 연결(무료 한도는 SKU 별 월 단위, 프로젝트가 아니라 결제 계정 기준일 수 있으니 콘솔 가격 페이지 확인). 예산 알림 설정.
6. 배포 후 확인: `GET /api/health`(`maps`·`staticMapsKey`) · `course-brief` 한 건(평점·지도) · 장소 검색 · 지도 로드 · `[directions] status=` 로그.
7. 이 문서의 표 A·B 를 새 프로젝트 이름으로 고친다.
