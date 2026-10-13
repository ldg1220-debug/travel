# 작업 지시서 — 새 대표 일수 코스 점검: 괌 섬·해변 오분류 · 치앙마이 209km · KK 선착장 순서

작성: 2026-10-13 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: #311 이후 대표 일수(4일) 코스 라이브 실측 (Cowork) — 블로그가 이 코스들로 "3박5일" 글을 쓰기 시작하므로 먼저 정리

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-13_typical-courses-qa.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 1. ★★★ 괌 4일 — 식당·디너쇼가 해변·섬으로, 배 구간이 디너쇼로

```
d1  괌 더비치 바 레스토랑[해변] · Beng Teng Spa[스파] · Pika's Cafe[음식점] · 하걋냐항구[선착장] · Fish Eye Island Cultural Dinner Show[섬]
d2  리티디안 포인트[기타] · 사랑의 절벽 · 에메랄드 밸리
d4  이파오 해변(스노클링)[공원] · Island Skin Spa · Mosa's Joint
```

- "Fish Eye Island Cultural Dinner Show" 는 디너쇼(공연·식당)인데 이름의 "Island" 로 **섬** 판정 → 선착장 앞 삽입 · 배 구간까지 생깁니다.
- "괌 더비치 바 레스토랑" 은 식당인데 이름의 "비치" 로 **해변**.
- 반대로 "이파오 해변" 은 공원, "리티디안 포인트"(해변 보호구역)는 기타.

```
① 이름 규칙보다 primaryType 의 식당·바·공연장(restaurant · bar · night_club · event_venue · performing_arts_theater) 을 먼저 — 이름에 Island/Beach/비치/해변이 있어도 식음료·공연이면 섬/해변 아님
② 섬 판정은 primaryType(island · natural_feature) 또는 "섬|Island$" 로 끝나는 이름만 (Island 가 중간에 있는 상호 제외)
③ 이름이 "…해변|…Beach|…비치" 로 끝나거나 "해변(" 로 시작하는 괄호 표기 → 해변 (type 이 park 여도)
```

## 2. ★★ 치앙마이 4일 209km — 외곽 폭포가 하루에

```
d4  몬쨈 · 앙 깨우 저수지 · 왓파랏 · 왓 프라탓 도이캄 · 와치라탄 폭포(도이 인타논, 시내에서 약 100km)
```

`dropRemoteResortStops`(휴양형 전용)를 도시형에도 적용: 코스 중심에서 60km 이상 + 그날 다른 스팟과 40km 이상 떨어지면 제외.
또 "카오소이 매싸이"[기타] → 음식점 (이름 사전: 카오소이 · 쌀국수 · 국수 · noodle).

## 3. ★★ 코타키나발루 4일 — 섬 다음에 선착장

```
d1  Poin Reflexology Spa · Welcome Seafood · KK Garden Seafood · 탄중 리팟 해변[공원]
d2  사피 섬[섬] → Star Marina[선착장]          ← 선착장이 섬 뒤 (갈 때 배를 어디서 타는지 없음)
d3  탄중 아루 · WOORI BBQ
d4  필리피노 마켓 · Guan's Kopitiam
```

- #304 순서 최적화의 "선착장 → 섬 묶음" 제약이 marina 를 선착장으로 묶지 않은 것으로 보입니다. Star Marina(category 선착장)도 섬 앞 고정 대상에 포함.
- 1일차 식당 2곳 연속(해산물 2곳) — 같은 날 식당 2곳 이상이면 다른 날로 1곳 이동(가능할 때).
- 탄중 리팟 해변[공원] — §1 ③ 규칙으로 해변.

## 4. ★ 대기 중이던 작은 것

```
용인 2일  2일차 에버랜드[F] + 캐리비안베이   ← 캐리비안베이도 종일 시설(워터파크). 같은 날 동반 금지 — 이름 사전에 캐리비안베이 추가 → 상한 규칙으로 제외/분리
오사카 3일 덴포잔 대관람차[기타] → 전망대 (이름 사전: 대관람차 · 관람차 · Ferris)
```

## 5. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | §1 괌 섬·해변 판정 | 소 · **최우선** |
| 2 | §3 marina 선착장 순서 · 식당 연속 | 소 |
| 3 | §2 도시형 원거리 제외 · 음식 이름 | 소 |
| 4 | §4 | 극소 |
| 5 | `COURSE_ALGO_VERSION` +1 | 극소 |

## 6. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| 괌 4일 | 디너쇼 · 레스토랑이 섬/해변 아님 · 배 구간 없음 · 이파오/리티디안 해변 |
| 치앙마이 4일 | 와치라탄 폭포 제외 · 총 km 대폭 감소 |
| 코타키나발루 4일 | 선착장 → 배 → 사피 섬 · 1일차 식당 1곳 |
| 용인 2일 · 오사카 3일 | 캐리비안베이 분리 · 대관람차 전망대 |

---

## 처리 결과

- §1 `courseRecommend.ts` isBeach/isIsland: 식음료·공연 시설(primaryType restaurant·bar·night_club·event_venue·performing_arts_theater·bar_and_grill, 또는 이름의 레스토랑·바·디너·쇼)은 Beach/Island 단어가 있어도 해변·섬 아님. 섬은 이름이 "섬/Island"로 끝나거나 Pulau·Isla 로 시작(괄호 표기 포함)일 때만. 이름이 해변·Beach·비치(+괄호 표기)로 끝나면 park 이어도 해변(`isBeachByName`, courseSpotCategory 에 적용). 리티디안은 이름 사전.
- §3 `pairJettiesBeforeIslands`(optimizeDayOrder 시작에서 호출): 같은 날 선착장(marina 포함)이 섬 뒤·다른 자리에 있으면 섬 바로 앞으로. `isBoatTripStop` 이 선착장 분류(isJetty)도 포함. `spreadMealsAcrossDays`: 식사 2곳 이상 날 → 식사 0곳·자리 있는 날로 15km 이내 1곳.
- §2 `dropRemoteResortStops` 에 옵션(centerKm/neighborKm/protect)을 열어 도시형 60/40km 적용(앵커·종일시설 제외). 카오소이·쌀국수·국수·noodle 은 음식점.
- §4 캐리비안 베이 종일시설 사전, 대관람차·관람차·Ferris 전망대.
- `COURSE_ALGO_VERSION` 37 → 38.
- 지시서와 다르게: ② "섬 = primaryType island · natural_feature" 중 natural_feature 는 넣지 않음(폭포·산도 natural_feature 라 전부 섬이 된다). §3 "식당 2곳 이상이면 이동"은 점심·저녁 2곳이 정상 분포라 "식사 0곳 날이 있을 때만"으로 좁힘.
