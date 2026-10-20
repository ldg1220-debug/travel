# 작업 지시서 — 평점은 "장소를 눌렀을 때만": 코스 생성에서 평점 검색(Enterprise) 제거

작성: 2026-10-20 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: 동근님 결정 (10/20, "클릭 시에만 평점") + /api/health·course-brief 라이브(10/19)

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-20_ratings-on-click.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 0-1. 배경

```
10/19  text-enterprise 오늘 38/38 · 월 444/900
       마카오3 · 칭다오3 · 홍콩4 · 단양2 · 공주2 → 스팟 8~16곳 · 평점 0곳 (ratingsUnavailable)
```

평점(rating·userRatingCount)을 받는 검색은 Enterprise(월 무료 1,000) 이고, 약관상 26시간 넘게 보관할 수 없어 매일 다시 받아야 합니다. 40여 도시 코스를 무료로 유지할 수 없어 하루 몫(≈38)을 넘기면 평점 없는 코스가 나가고, 블로그(AutoPipeline)는 평점 없는 지역을 건너뛰어 발행이 0편이 됐습니다.

**결정: 코스(목록·페이지·course-brief)에서는 평점을 쓰지 않는다. 평점·사진·리뷰는 사용자가 장소를 눌렀을 때 상세 시트에서만 (#326 의 Place Details, 월 무료 1,000 · 클릭당 1회).**

## 1. 할 것

```
① 후보 검색을 Pro(월 무료 5,000) 필드로 고정 — rating · userRatingCount · priceLevel 등 Enterprise 필드 제거
   googleTop · 슬롯/동의어/랜드마크 풀 · 해변·선착장 검색 · pipeline/placesMapping 전부
   필요 필드: id, displayName, location, primaryType, types, businessStatus, formattedAddress(필요 시)
   순위 = Google 응답 순서(관련도·인지도) 그대로 + 기존 타입/거리/중복 규칙
   businessStatus != OPERATIONAL 제외
② 품질 게이트(passesQualityGate) 재설계 — 평점·리뷰 수 조건 삭제
   대신: 영업 중 · 타입 화이트리스트 · 중복/체인 제외 · 지역 반경 · 랜드마크 우선
   isCourseBriefThin · insufficient_spots 도 평점 조건 없이 "스팟 수" 기준만
   ratingsUnavailable 플래그는 더 이상 의미 없음 → 제거 또는 항상 생략
③ course-brief 응답: spots[].rating · reviewCount 필드 삭제(또는 항상 null), ratingSource 삭제
   새 필드 ratingPolicy: "on-click" (AutoPipeline 이 계약 변경을 감지하도록)
   placeId 는 계속 포함 (무기한 보관 허용)
④ 코스 페이지·허브·홈 카드: 평점/리뷰 수 표시 제거
   출처 표기는 "장소 정보 제공: Google Maps" 로 (이름·위치도 Google 콘텐츠)
   JSON-LD 에 rating 류 없음 유지
⑤ 평점은 상세 시트(PlaceDetailOverlay)에서만 — 지금처럼 details-enterprise 가드 안
   /discover 카드 지표(getSpotMetrics) 도 카드 목록에서는 제거, 카드를 눌렀을 때 상세에서
⑥ mapsBudget: text-enterprise 사용처가 0 이 되어야 함 (사용자 장소 검색 api/places/search 가 평점을 쓰면 그것만 남김 — 검색 결과 목록도 평점 없이 Pro 로 바꿀지 보고)
⑦ 버전: COURSE_ALGO_VERSION +1 은 하되 #323 의 stale-while-rebuild(직전 캐시 서빙) + 페이싱 안 재빌드 그대로 — 일괄 재생성 금지
   (이제 재빌드는 Pro 라 무료 5,000 안 — 하루 상한 text-search-all 450 은 유지)
⑧ docs/GOOGLE_APIS.md 갱신
```

## 2. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | ①②③ 코스 생성 평점 제거 | 중 · **최우선** |
| 2 | ④⑤ 화면 | 소 |
| 3 | ⑥⑦⑧ | 소 |

## 3. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| course-brief 마카오3 · 칭다오3 · 홍콩4 · 단양2 · 공주2 | 200 · 스팟 정상 · rating 없음 · ratingPolicy "on-click" |
| /api/health | text-enterprise 증가 거의 0 · text-pro 증가 |
| /course/홍콩/3박4일 | 평점 표시 없음 · "장소 정보 제공: Google Maps" |
| 일정 카드 클릭 | 상세 시트에 평점·사진·리뷰 (기존대로) |

---

## 처리 결과 (2026-10-20)

- §1① `googleTop` 필드 마스크를 Pro 로 고정(`id, displayName, formattedAddress, location, primaryType, types, businessStatus, photos, googleMapsUri`). `rating · userRatingCount · priceLevel` 제거. `businessStatus` 가 OPERATIONAL 이 아니면 제외(필드 없으면 유지). 순위 = Google 응답 순서(`Place.searchRank`), 기존 거리/중복/타입 규칙 그대로. 파이프라인 `placesMapping` 도 평점 제거.
- §1② `passesQualityGate`: 평점·리뷰 수 조건 삭제 → 관광과 무관한 시설 유형(은행·주유소·병원 등) 제외만. 평점 기반 판단(중복 정리·일자 상한·앵커 선정·첫 스팟 선호)은 `searchRank`(popularityOf)로 대체. `isCourseBriefThin`·`insufficient_spots`·`judgeCourseBrief` 는 스팟 수만 본다. `ratingUnavailable`/`ratingsUnavailable`/degraded 풀 경로 제거, 평점 라이브 보강(`liveEnrichSpots`)·카탈로그 평점 조인·"평점 있는 곳을 1번 자리로" 후처리 삭제.
- §1③ course-brief: `spots[].rating · reviewCount`, `ratingSource`, `ratingsUnavailable` 삭제, `ratingPolicy: "on-click"` 추가, `placeId` 유지. 읽기 경로(`normalizeBriefPayload`)가 옛 캐시 형식을 새 계약으로 바꿔 돌려준다.
- §1④ 코스 페이지: 평점·리뷰 수 표시 없음, 출처 "장소 정보 제공: Google Maps"(`GoogleAttribution variant="place"`), JSON-LD rating 없음 유지.
- §1⑤ /discover 카드 목록에서 평점·리뷰 수·가격대 제거(spot-metrics 호출·갱신 삭제) — 상세 시트(`/api/places/details`, details-enterprise 가드)에서만.
- §1⑥ `text-enterprise` 사용처는 사용자 장소 검색 `api/places/search` 만 남음(평점·리뷰 수·가격대·사진 표시). 검색 목록도 평점 없이 Pro 로 바꿀지는 별도 결정으로 보고.
- §1⑦ `COURSE_ALGO_VERSION` 40 → 41. stale-while-rebuild(직전 버전 캐시 서빙)·페이싱·하루 상한은 그대로, 일괄 재생성 없음.
- §1⑧ `docs/GOOGLE_APIS.md` 갱신.
