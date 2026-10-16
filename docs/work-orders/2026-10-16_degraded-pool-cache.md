# 작업 지시서 — 긴급(장애 계속): #323 후에도 해외 코스 500 — 강등 후보 풀이 캐시에 남음

작성: 2026-10-16 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `47683db`(#323) 배포 후 Cowork 라이브 실측
**최우선.**

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-16_degraded-pool-cache.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 1. 실측

```
200  오사카/2박3일 · 서울/2박3일 · 제주/2박3일 · 부산/1박2일 · 다낭/3박4일
500  ("코스를 준비하고 있어요")  도쿄/2박3일 · 세부/3박4일 · 세부/5박7일 · 후쿠오카/2박3일 · 방콕/2박3일 · 코타키나발루/2박3일 · 코타키나발루/5박7일
course-brief 세부4 → 422 insufficient_spots count 0 (788ms) · 도쿄3 → 422 count 0 (144ms)
/api/health  text-enterprise 282/900 · today 1/38   ← 예산은 남아 있는데도 실패
             text-pro 67/4500 · today 1
```

예산이 남았는데 **0.1~0.8초 만에 count 0** → Google 을 부르지 않고 캐시만 읽고 실패하는 것으로 보입니다.

## 2. 추정 원인

10/15 페이싱 소진 때 Pro 강등 검색 결과(평점 없음)가 **#323 이전 코드로** 후보 풀 캐시(`overseas:{도시}:{키워드}:{카테고리}`, 26시간)에 저장됐습니다. 이 항목에는 #323 의 `ratingUnavailable` 표시가 없어서 품질 게이트가 전부 떨어뜨리고, 캐시가 살아 있는 동안(최대 10/16 저녁) Google 재조회도 하지 않습니다. 실패 결과 자체를 캐시(음성 캐시)하는 경로가 있으면 그것도 원인입니다.

## 3. 할 것

```
① 즉시: 후보 풀 캐시에서 평점이 하나도 없는 항목(강등 결과) 삭제 — 일회성 정리 스크립트 또는 배포 시 1회 실행
   + course-brief 의 실패/insufficient 결과를 캐시하는 경로가 있으면 그 행도 삭제
② 강등(Pro) 검색 결과는 후보 풀 캐시에 저장하지 않음 (요청 내에서만 사용)
   또는 저장하되 ratingUnavailable 표시를 함께 저장하고, 예산이 풀리면(오늘 상한 여유) 무시하고 Enterprise 재조회
③ 캐시에서 읽은 후보에 rating 이 전부 없으면 "강등 결과" 로 간주 → ratingUnavailable 로 게이트 통과 (구버전 캐시 호환)
④ insufficient_spots / 페이지 unavailable 은 캐시하지 않음 (다음 요청이 다시 시도)
⑤ 로그 [course-page] unavailable … reason= 에 pool 출처(cache|google|degraded)와 후보 수 포함
```

## 4. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| 위 500 목록 7개 | 200 |
| course-brief 세부4 · 도쿄3 | 200 (평점 없어도 됨) |
| /api/health text-enterprise | todayCount ≤ 38, 재조회로 소폭 증가 |
| 3일차 이후 관광지·카페 | 비지 않음 |

---

## 처리 결과

- **원인(코드로 확인)**: 후보 풀 캐시(`overseas:…`, `landmark…`, 26시간)에 10/15 Pro 강등 결과(평점 없음)가 #323 이전 코드로 저장돼 `ratingUnavailable` 표시가 없었다. 읽기 경로가 그 풀을 그대로 쓰면 `passesQualityGate` 가 전부 떨어뜨려 슬롯 후보 0 → 코스 0곳(count 0, 0.1~0.8초: Google 호출 없음) → 422 → 페이지 일시 오류. 예산은 남아 있는데도(today 1/38) 캐시 때문에 재조회가 일어나지 않았다. 음성 캐시는 없다 — 빈 풀은 쓰지 않고(`fresh.length > 0`), 브리프는 `isCacheableBrief` 통과 시에만 쓴다(④ 확인).
- ②③ `courseRecommend.usableCachedPool`: 캐시에서 읽은 해외 풀이 강등 풀(`ratingUnavailable` 표시가 모두 있거나, 표시 없는 구버전도 5곳 이상이 전부 평점·리뷰 수 없음 = `isDegradedPool`)이면 — Enterprise 예산에 여유가 있으면(`isMapsThrottled` false) 캐시를 무시하고 Enterprise 로 재조회해 덮어쓰고, 아직 막혀 있으면 후보마다 `ratingUnavailable` 을 달아 게이트를 통과시킨다(구버전 캐시 호환). 슬롯 풀 · 동의어 풀 · 랜드마크 풀 모두 적용. 강등 결과 저장은 유지하되 표시와 함께 저장(예산이 풀리면 위 경로로 재조회).
- ① `placesRetention.purgeDegradedCandidatePools`: 평점이 하나도 없는 5곳 이상 후보 풀 행을 삭제 — 워밍 크론의 purge 에 포함(응답 `purged.degradedPools`). 배포 즉시의 정리는 읽기 경로 자가 치유가 맡는다(첫 요청이 재조회/게이트 통과).
- ⑤ 후보 풀 출처 집계(`collectPoolStats`): 코스를 만드는 동안 cache|google|degraded 호출 수와 후보 수를 모아 `brief.poolStats` 에 남기고(`[courseBrief] pool-stats …` 로그), `[course-page] unavailable … reason=thin(…) pool=cache:N/google:N/degraded:N candidates=N` 로 사유 로그에 포함. 해외 슬롯 후보가 게이트 후 0 이면 `[courseRecommend] pool source=cache slot= city= raw= gated=0` 경고.
- `COURSE_ALGO_VERSION` 40 유지(코스 규칙 변화 없음 — 캐시 읽기 처리만 바뀜).
- 한계: 재조회가 일어나는 첫 요청들은 슬롯당 Enterprise 호출이 늘어(오늘 상한 38 안에서) 일부 슬롯이 재조회 대신 막혀 평점 없이 나갈 수 있다. 풀 단위로 보면 지역당 약 10회이므로 오늘 상한으로 약 3~4지역분.
