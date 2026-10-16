# 작업 지시서 — 긴급(장애 원인 확정): 콘솔 하루 상한 100 소진 → 모든 Text Search 429

작성: 2026-10-16 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `fc3ca10`(#324) 배포 후 라이브 + Cloud 콘솔(splendid-flow-501212-p3) 직접 확인

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-16_console-daily-quota-429.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 1. 실측 (10/16 09:40 KST)

```
페이지  200: 도쿄/2박3일(17초) · 오사카 · 서울 · 제주 · 부산 · 다낭
        500: 세부/3박4일 · 세부/5박7일 · 후쿠오카/2박3일 · 방콕/2박3일 · 코타키나발루/2박3일 · 코타키나발루/5박7일
brief   방콕3 422 count 0 (165ms) · KK3 422 count 0 (155ms) · 세부4 422 no_beach count 9 (7초)
health  text-enterprise 282/900 today 1/38 · text-pro 67 today 1
콘솔    SearchTextRequest per day  100 / 100 → 현재 사용 105 (100%)   ← 원인
        Places API (New) 최근 24시간 337건 중 4xx 140건
```

**Text Search 는 SKU(Enterprise/Pro/IDs Only) 와 상관없이 같은 콘솔 하루 상한(SearchTextRequest per day)을 나눠 씁니다.** 동근님이 10/14 에 100 으로 낮췄고, 10/15 재빌드 폭주로 다 썼습니다. Google 의 하루는 **태평양 시간 자정(KST 16:00, 서머타임 끝나면 17:00)** 에 리셋됩니다. #322 의 429 표시는 UTC 날짜 키라 리셋 시점이 어긋납니다.

동근님께 콘솔 상한을 올리도록 안내했습니다(코드 가드가 비용을 막으므로). 코드 쪽은 아래를 맞춥니다.

## 2. 할 것

```
① 콘솔 상한 인지 — mapsBudget 에 "text-search-all" 일 카운터 추가 (Enterprise·Pro·IDs Only 합산)
   상한 = 환경 변수 GOOGLE_TEXT_SEARCH_DAILY_QUOTA (기본 = 콘솔 값) × 0.9
   GetPlace 도 같은 방식 (GOOGLE_GET_PLACE_DAILY_QUOTA)
   이 상한에 닿으면 Google 을 부르지 않음 (429 를 맞기 전에 멈춤)
② 일 카운터·429 표시의 날짜 = America/Los_Angeles 날짜 (Google 쿼터 리셋과 일치)
   Enterprise 페이싱(월 예산 ÷ 남은 날)도 같은 날짜 기준
③ 429 를 맞으면 그 날(태평양) 남은 Text Search 전부 skip → 다음 리셋 후 자동 재개 (현재 구현 유지, 날짜만 교정)
④ 세부 4일 no_beach (count 9): 강등/평점 없음 상태에서도 해변 판정이 되는지 — 해변 판정이 rating/리뷰 수에 의존하면 제거
⑤ /api/health maps 에 textSearchAll.todayCount · todayLimit · quotaResetAt(KST) 추가
```

## 3. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| 위 500 6개 | 200 (콘솔 리셋 또는 상한 상향 후) |
| /api/health | textSearchAll today ≤ 콘솔 상한 × 0.9 · quotaResetAt 16:00/17:00 KST |
| 콘솔 SearchTextRequest per day | 100% 에 닿지 않음 |

---

## 처리 결과

- ① `mapsBudget` 에 콘솔 하루 상한 집계 `text-search-all`(Enterprise · Pro · **IDs Only 합산**) · `get-place-all`(Details) 일 카운터. 가드 상한 = 환경 변수(`GOOGLE_TEXT_SEARCH_DAILY_QUOTA` · `GOOGLE_GET_PLACE_DAILY_QUOTA`, 기본 100) × 0.9 = 90. 닿으면 Google 을 부르지 않는다(워밍은 절반 45까지 — 나머지는 사용자 요청용). IDs Only 호출(`resolvePlaceId` 등)도 이제 집계에 예약한다. 월 SKU 한도에서 막힌 호출은 집계 예약을 되돌린다.
- ② 일 카운터·429 표시·월 키·남은 날 수의 날짜 = `America/Los_Angeles`(`ptDateString`). Enterprise 페이싱(월 예산 ÷ 남은 날)도 같은 날짜. 리셋 시각 `nextQuotaResetAt`(다음 태평양 자정 = 서머타임 중 KST 16:00, 끝나면 17:00).
- ③ 429 표시는 집계 키(`maps-429:text-search-all:{PT날짜}`)에 — Text Search 는 SKU 와 무관하게 같은 상한이라 Enterprise · Pro · IDs Only 가 함께 skip 된다. IDs Only 429 도 표시·되돌림(`settleGuarded` 가 `ids`/`kind` 로 처리).
- ⑤ `/api/health` `maps.textSearchAll` · `maps.getPlaceAll`: `todayCount`, `todayLimit`(= 상한×0.9), `quota`(콘솔 값), `quota429`(오늘 429 표시), `quotaResetAt`(ISO), `quotaResetAtKst`.
- ④ 세부 4일 `no_beach`(count 9): **해변 판정은 rating/리뷰 수에 의존하지 않는다**(`isBeach` 는 primaryType `beach` 또는 이름, `meetsResortBeachRequirement` 도 같음) — 제거할 것이 없다. 원인은 해변 후보 검색이 막혀서다: `ensureResortBeachSpot` 이 "해변"/"beach" 검색(Text Search)을 하는데, 콘솔 상한 소진으로 429 → 후보 0 → 해변 보장 실패 → 휴양형 요건 불충족. 이번 변경(집계 가드 + 태평양 날짜 리셋 + 상한 상향 안내)으로 같은 원인이 풀린다. 강등 후보 풀의 평점 없음은 #323/#324 로 게이트 통과 처리됨.
- 코드 한계: 콘솔 상한은 코드가 읽을 수 없어 환경 변수 값을 사람이 맞춰야 한다(콘솔을 올리면 `GOOGLE_TEXT_SEARCH_DAILY_QUOTA` 도 올릴 것). 환경 변수가 없으면 100(현재 콘솔 값)으로 본다.
- `COURSE_ALGO_VERSION` 40 유지(코스 결과 규칙 변화 없음).
