# 작업 지시서 — 숙소 예약 버튼을 수익 나는 제휴 링크로 (Travelpayouts: Agoda · Trip.com · Booking.com)

작성: 2026-10-30 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: 동근님 지적("숙소 추천이 네이버뿐 — 나한테 이득이 없다") + Cowork 가 동근님 Travelpayouts 계정(ID 765548) 카탈로그 확인

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-30_lodging-affiliate.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 0-1. 배경

계획 화면의 "숙소 예약" · "○일차 일정 근처 숙소 보기" 가 네이버로만 연결돼 예약이 일어나도 수익이 0 입니다.
Travelpayouts 카탈로그(10/30 확인, Hotels & Accommodations):

| 프로그램 | 수수료 | 쿠키 | 비고 |
|---|---|---|---|
| Agoda | 1–6% | 1일 | 아시아 숙소 강함 |
| Trip.com | 1–5.5% | 7–30일 | 숙소+항공, 쿠키 김 |
| Booking.com | 3–5% | 한 세션 | 전 세계 |
| Rakuten Travel (JP) | 고정 100–800¥ | 30일 | 일본 한정 |

동근님 계정은 아직 숙소 프로그램 **미가입**(가입한 25개: Klook·Yesim·Airalo·Kiwitaxi 등). 가입은 동근님이 Travelpayouts 에서 신청 → 승인 후 링크 생성 가능. 승인 전에도 코드는 준비.

## 1. 할 것

```
① 숙소 제휴 링크 생성기 src/lib/lodgingAffiliate.ts
   입력: 지역(도시) · 체크인/체크아웃(계획 날짜, 날짜 미정이면 생략) · 인원(기본 2) · 일정 근처 좌표(그날 첫/마지막 스팟 중심)
   출력: Travelpayouts 추적 링크 (marker 765548 · trs 563085 · campaign_id 는 프로그램별 환경변수
         TP_CAMPAIGN_AGODA / TP_CAMPAIGN_TRIPCOM / TP_CAMPAIGN_BOOKING — 승인 후 동근님/Cowork 가 값 입력)
         대상 URL = 각 사이트 검색 페이지(도시·날짜·인원 쿼리) · sub_id = tradule_{지역}_{day}
   campaign_id 가 비어 있으면 해당 공급자는 숨김
② 화면: "숙소 예약" 시트에 공급자 버튼 2~3개 (해외: Agoda · Trip.com · Booking.com / 일본: + Rakuten Travel / 국내: Agoda · Trip.com 우선, 네이버는 보조 링크로 맨 아래)
   "○일차 일정 근처 숙소 보기" 도 같은 생성기 사용 (그날 권역 중심 좌표 기반 — 지원하는 공급자만)
   제휴 고지 1줄: "일부 링크는 제휴 링크이며 예약 시 수수료를 받을 수 있습니다."
③ 코스 페이지(/course/…) 하단에도 "이 지역 숙소 보기" 같은 버튼 (색인 12개 우선)
④ 클릭 이벤트 기록 lodging_click { provider, region, day, hasDates }
⑤ 금지: 숙소 "추천"(특정 호텔 지목)은 하지 않음 — 검색 결과 페이지로만 보냄 (근거 없는 추천 금지 원칙)
```

## 2. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| 계획 → 숙소 예약 | 공급자 버튼(승인된 것만) · 링크에 marker=765548 · 날짜 반영 |
| campaign_id 미설정 공급자 | 숨김 |
| 코스 페이지 | 숙소 보기 버튼 · 제휴 고지 |

---

## 처리 결과

- ① `src/lib/lodgingAffiliate.ts`: 도시 · 체크인/체크아웃 · 인원(기본 2) · 일정 근처 좌표를 받아 Travelpayouts 추적 링크(`https://tp.media/r?marker=765548&trs=563085&campaign_id=…&sub_id=tradule_{지역}_{일차}&u=<도착 URL>`)를 만든다. 도착 URL 은 각 사의 **검색 결과 페이지**(Agoda `/search`, Trip.com `/hotels/list`, Booking.com `/searchresults.ko.html`; 호텔 지목 없음). campaign_id 환경 변수가 비어 있는 공급자는 숨긴다. 날짜 미정·이미 지난 날짜·체크아웃 ≤ 체크인이면 날짜를 생략한다.
- ② 계획 화면 "숙소 예약" 시트: 새 제휴 링크(Agoda · Trip.com · Booking.com, 일본이면 Rakuten Travel 추가) → 기존 직접 제휴 링크 → 네이버(커미션 없는 보조, 맨 아래; 국내는 항상, 해외는 기존 규칙 그대로)로 합친다(`mergeLodgingProviders`). "○일차 일정 근처 숙소 보기"는 그 날짜 하루(체크인 = 그 날, 체크아웃 = 다음 날)와 그 날 일정의 중심 좌표로 만든다 — 좌표는 지원하는 공급자(Booking.com)만 쓰고 나머지는 도시 단위 + 날짜. 제휴 고지는 기존 `AffiliateDisclosureNote`(제휴 링크가 있을 때만).
- ③ 코스 페이지(`/course/…`) 하단 "{지역} 숙소 보기"(`LodgingAffiliateLinks`) — 색인 대상 여부와 무관하게 제휴 링크가 있을 때만 보이고(`rel="sponsored nofollow noreferrer"`), 고지 1줄. 날짜 없는 도시 단위 링크.
- ④ `lodging_click` 이벤트(`featureEvents.ts`에 추가) { provider, region, day, hasDates } — 계획 화면·코스 페이지에서 클릭 시 `trackFeatureEvent`. 기존 `lodging_cta_events`(open/click)는 그대로 함께 기록.
- ⑤ 특정 호텔 "추천"은 하지 않는다(검색 결과 페이지로만).
- 환경 변수: 지시서의 `TP_CAMPAIGN_*` 대신 **`NEXT_PUBLIC_TP_CAMPAIGN_AGODA / _TRIPCOM / _BOOKING / _RAKUTEN`** 으로 했다. 링크를 브라우저(계획 화면)에서 조립하므로 `NEXT_PUBLIC_` 접두어가 없으면 번들에 들어가지 않는다. 선택 항목: `NEXT_PUBLIC_TP_PROGRAM_*`(추적 링크의 `p=`), `NEXT_PUBLIC_TP_MARKER`/`_TRS`(기본 765548/563085). `.env.example` 에 추가.
- 확인이 필요한 것: 아직 프로그램 승인 전이라 실제 추적 링크를 만들어 보지 못했다. 추적 링크의 파라미터 구성(특히 `p=`)과 각 사 검색 URL 의 날짜 파라미터 이름(`checkIn`/`checkin`/…)은 승인 뒤 대시보드가 만든 링크와 대조해야 한다. Rakuten 도착 URL 은 검색 쿼리 없이 `https://travel.rakuten.co.jp/` 이다.
- 이번에 손대지 않은 곳: 코스 만들기 화면(`CourseClient`)과 탐색 카드(`DiscoverClient`)의 숙소 버튼은 기존 `bookingProviders` 그대로다.
