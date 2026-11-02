# 작업 지시서 — 숙소 링크: 지금 연결된 Klook 호텔(8%)을 먼저 붙이기

작성: 2026-11-02 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: Cowork 가 동근님 Travelpayouts 계정(ID 765548) 직접 확인 (11/02 06:42 서버시간)

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-11-02_lodging-klook-hotels.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 0-1. 확인한 사실

```
- 링크 만들기(Create link)에서 고를 수 있는 프로그램: Klook · Yesim · Kiwitaxi · Tiqets · Airalo · KKday 등 24개
  → Agoda · Trip.com · Booking.com · Rakuten 없음 (아직 미연결)
- Agoda 프로그램 페이지: "We're reviewing your Project and matching it with available programs — usually a few days" (사전 승인 필요)
- Klook 은 이미 연결됨. Travelpayouts 공지: Klook 호텔 예약 수수료 8% (아시아 호텔)
- 실제 동작 중인 추적 링크 형식(블로그에 이미 사용, 수익 귀속 확인된 형식):
  https://tp.media/r?campaign_id=137&marker=765548&p=4110&sub_id=...&trs=563085&u=<encoded url>
  → #347 lodgingAffiliate 의 p=·campaign_id 구성과 같은지 대조 (다르면 이 형식으로)
- Klook 도시별 호텔 페이지 (Klook 사이트에서 확인): https://www.klook.com/ko/destination/{cityId}/3-hotel/
  오사카 c29-osaka · 도쿄 c28-tokyo · 방콕 c4-bangkok · 다낭 c74-da-nang · 홍콩 c2-hong-kong · 하노이 c34-hanoi
  세부 c97-cebu · 타이베이 c19-taipei · 부산 c46-busan · (후쿠오카·제주·경주는 확인 필요)
  공통 랜딩: https://www.klook.com/ko/hotels/  · Klook 제휴 호텔 모음: https://www.klook.com/tetris/promo/klookaffiliate-hotels/
```

## 1. 할 것

```
① lodgingAffiliate 에 공급자 klook-hotel 추가 — campaign_id 137 · p 4110 (기존 Klook 활동 링크와 같은 값, 코드 기본값으로 둬도 됨)
   도착 URL: 도시 매핑이 있으면 /ko/destination/{cityId}/3-hotel/, 없으면 /ko/hotels/
   매핑 없는 도시(후쿠오카·제주·경주 등)는 Klook 사이트에서 cityId 를 확인해 추가 — 확인 못 한 것은 /ko/hotels/ (지어내지 말 것)
   날짜·좌표는 Klook 도시 페이지가 받지 않으면 생략
   sub_id = tradule_{지역}_{day} (기존 규칙)
② 숙소 예약 시트 순서: 승인된 공급자(Agoda·Trip.com·Booking — 지금은 숨김) → Klook 호텔 → 네이버(보조)
   즉 지금 당장은 "Klook 에서 숙소 보기" 가 첫 버튼
③ 코스 페이지 "{지역} 숙소 보기" 도 Klook 이 있으면 노출 (제휴 고지 유지)
④ lodging_click provider 값에 klook-hotel
```

## 2. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| 계획 → 숙소 예약 (오사카) | Klook 버튼 · tp.media 링크 · u= 가 c29-osaka 호텔 페이지 |
| 코스 페이지 오사카·경주 | 숙소 보기 노출 · 경주는 확인된 cityId 또는 /ko/hotels/ |
| Agoda 등 | 여전히 숨김 (승인 전) |

---

## 처리 결과

- ① `lodgingAffiliate.ts` 에 공급자 `klook-hotel` 추가 — `campaign_id=137` · `p=4110` 을 **코드 기본값**으로 두었다(`NEXT_PUBLIC_TP_CAMPAIGN_KLOOK` / `_PROGRAM_KLOOK` 로 덮어쓸 수 있음). 도착 URL: 확인된 9개 도시(오사카 c29-osaka · 도쿄 c28-tokyo · 방콕 c4-bangkok · 다낭 c74-da-nang · 홍콩 c2-hong-kong · 하노이 c34-hanoi · 세부 c97-cebu · 타이베이 c19-taipei · 부산 c46-busan)는 `https://www.klook.com/ko/destination/{cityId}/3-hotel/`, 그 밖(후쿠오카·제주·경주 등 확인 못 한 도시)은 `https://www.klook.com/ko/hotels/` — cityId 를 지어내지 않았다. 날짜·좌표·인원은 도착 URL 에 싣지 않는다. sub_id = `tradule_{지역}_{day}`.
- 추적 링크 형식 대조: 지시서의 동작 중인 형식(`tp.media/r?campaign_id=137&marker=765548&p=4110&sub_id=…&trs=563085&u=<인코딩 URL>`)과 #347 생성기의 구성(`marker` · `trs` · `campaign_id` · `p`(프로그램 id 설정 시) · `sub_id` · `u`)이 같은 파라미터 집합이다(순서만 다름). Klook 은 `p` 도 기본값으로 항상 실린다. Agoda 등은 `p` 값을 아직 모르므로(승인 후 대시보드 값) 지금처럼 환경 변수로 받는다.
- ② 순서: 승인된 공급자(Agoda · Trip.com · Booking · Rakuten, 지금은 campaign_id 가 없어 숨김) → 기존 직접 제휴 링크 → **Klook 호텔** → 네이버(국내 보조, 맨 아래). 지금은 Klook 이 첫 버튼이다(국내는 그 아래 네이버).
- ③ 코스 페이지 "{지역} 숙소 보기" 는 같은 생성기를 쓰므로 Klook 이 있으면 자동으로 노출된다(제휴 고지 유지, `rel="sponsored nofollow noreferrer"`).
- ④ `lodging_click` 의 `provider` 값이 `klook-hotel` 로 기록된다(계획 화면 · 코스 페이지).
- 환경 변수가 비어 있어도 Klook 이 켜지는 점이 Agoda 등과 다르다 — Klook 을 끄고 싶으면 `NEXT_PUBLIC_TP_CAMPAIGN_KLOOK` 에 다른 값을 줄 수는 있지만 빈 값으로는 끌 수 없다(코드 기본값이 대신 채워진다). 끄는 스위치가 필요하면 알려 달라.
- `COURSE_ALGO_VERSION` 은 올리지 않았다(코스 생성과 무관).
