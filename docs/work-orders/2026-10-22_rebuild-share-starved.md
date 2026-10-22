# 작업 지시서 — #336 검증: 원인 확정 — 재생성이 "워밍 몫"을 사용자 요청에 뺏겨 spots=0 실패

작성: 2026-10-22 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `b80a606`(#336) 배포 후 /api/health courseBuild 실측 (10/22 오전)

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-22_rebuild-share-starved.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 1. 실측

```
courseBuild
  currentVersion 44
  lastRebuildOkAt      2026-10-21T19:39Z   (성공 이력은 있음)
  lastRebuildAt        2026-10-21T21:45Z   key content-brief:overseas:나고야:4:v44
  lastRebuildResult    "fail: transient(spots=0)"
  lastWarmAt / lastWarmResult  null       (#336 배포 후 아직 크론 안 돎 — 05:00 UTC)
  staleServedToday 102 · visitsHumanToday 82 · visitsBotToday 170
maps.text-pro  월 1,825 · today 197/261 · todayBySource { user:147, rebuild:50, warm:0 }
course-brief 오사카 3  → 여전히 이전 버전 (transit59 · 다리 기타 · landmarkRank 없음)
```

해석: 재생성은 시작되고(started→fail), 실패 사유가 spots=0 transient = **후보 검색이 가드에 막혀 0건**. 재생성·워밍은 "오늘 상한의 50%(≈130)" 안에서만 돌게 돼 있는데, 그 50% 를 **전체 todayCount(사용자 147 포함)** 로 계산하는 것으로 보입니다. 사용자 요청이 먼저 130 을 넘기면 그날 재생성은 전부 spots=0 으로 실패 → 새 버전이 영원히 안 만들어짐.

## 2. 할 것

```
① 재생성·워밍 몫은 rebuild+warm 사용분만으로 계산 (사용자 사용분과 분리)
   rebuild+warm ≤ floor(todayLimit × 0.5) · user ≤ todayLimit − (rebuild+warm 사용분)
② 몫이 없어 후보 검색을 못 하면 "fail" 이 아니라 "deferred: budget" 으로 기록하고 다음 날 우선 대상으로 남김
   (spots=0 으로 빌드를 시도하지 않음 — 불필요한 계산·로그 방지)
③ todayBySource.user 147 의 정체 보고: 사용자 장소 검색(api/places/search 강등)인지, 직전 버전이 없는 조합의 동기 빌드인지
   — 후자라면 그것도 v44 를 만든 것이므로 courseBuild 에 같이 기록
④ 버전 전환 진행률: courseBuild.versionProgress { total(사이트맵 조합 수), onCurrent, onPrevious } — 매일 몇 개가 새 버전으로 바뀌는지
⑤ 봇 170 vs 사람 82 — 봇은 재생성을 안 일으키는지(#334) courseBuild 에 rebuildTriggeredByBot 0 확인용 카운터
```

⑥ (#334 남은 결정) 종일시설 날 동반 규칙 — 결정: **시설 + 저녁 1곳까지**
   종일시설(USJ · 디즈니 · 해양공원 · 에버랜드 · 롯데월드 · 레고랜드 · 캐리비안베이 …) 날은
   시설 다음에 식당 또는 야간형 1곳만 (시설에서 3km 이내), 관광지·전망대·시장 동반 금지
   예: 홍콩 해양공원 날의 완차이 마켓 · 스카이 테라스 428 → 다른 날로 이동(자리 없으면 제외)

`COURSE_ALGO_VERSION` 은 ⑥ 때문에 +1 하되, ①(재생성 몫 분리)이 같은 PR 에 들어가야 함 — 몫 분리 없이 버전만 올리면 또 멈춤.

## 3. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| courseBuild.lastRebuildResult | ok (또는 deferred: budget, fail 아님) |
| versionProgress.onCurrent | 날마다 증가 |
| course-brief 오사카 3 | v44 결과 (transit59 없음 · 다리 관광지 · landmarkRank) |
| lastWarmAt | 05:00 UTC 이후 값 |

---

## 처리 결과

- **원인 확정(코드로 재현)**: `mapsBudget.reserveMapsOp` 가 워밍·재생성 몫(오늘 상한의 50%)을 **전체 오늘 호출 수(사용자 포함)** 와 비교하고 있었다. 사용자 요청이 130을 먼저 넘기면 그날 재생성·워밍의 모든 text-pro 호출이 pacing 으로 거절 → 후보 0건 → `fail: transient(spots=0)`. 콘솔 하루 상한 집계(`reserveAggregate`, `isMapsThrottled`)도 같은 식이었다.
- ① 몫 분리: 워밍·재생성은 `warm+rebuild` 사용분(`maps-ops-day-src:*` 카운터, 집계용 카운터 신설)이 `floor(오늘 상한 × 0.5)` 안일 때만, 그리고 총 사용이 오늘 상한 안일 때만 호출한다. 사용자는 총 사용이 오늘 상한 안일 때까지(= 상한 − 백그라운드 사용분). 취소·429 정산도 같은 카운터를 되돌린다.
- ② 몫이 없으면 `deferred: budget` 으로 기록(빌드 시도 안 함, 빌드 도중 몫이 바닥나 spots=0 이면 그것도 deferred). `course-deferred:{지역}:{일수}` 행을 남기고 워밍 크론이 다음 실행에서 방문 조합보다 먼저 만든다(`/api/cron/warm-course-brief` 응답·`lastWarmResult` 에 `미뤄짐 N`).
- ③ `todayBySource.user` 147: 코드로는 출처를 가를 수 없어 `courseBuild.syncBuildsToday`(직전 버전이 없어 사용자 요청이 동기로 새 버전을 만든 횟수)를 추가했다. 사용자 장소 검색(`/api/places/search`)은 text-pro 를 쓰므로 `user − (동기 빌드가 쓴 호출)` 은 그 검색과 일반 요청분이다. 동기 빌드도 v44 를 만든 것이므로 같이 센다.
- ④ `courseBuild.versionProgress { total(사이트맵 조합), onCurrent, onPrevious, missing }`.
- ⑤ `courseBuild.rebuildTriggeredByBotToday`(0 이어야 함; 로봇 요청이 재생성을 일으키면 1씩 오른다 — 설계상 로봇은 재생성을 예약하지 않는다).
- ⑥ 종일시설 날: 시설 + 시설에서 3km 이내 식당(카페 포함) 또는 야간형 **1곳**까지. 일반 관광지·시장·전망대(스카이 테라스·타워·전망대·테라스 이름)는 동반 금지 → 시설 없는 날 중 자리 있는 가까운 날로 이동, 자리가 없으면 총량이 허용하는 만큼 제외. 여러 곳이 조건을 채우면 야간형 우선 1곳만 남긴다. `COURSE_ALGO_VERSION` 44 → 45.
- 해석한 것: 지시서가 "야간형"과 "전망대 금지"를 함께 말해, 야간 슬롯에서 온 전망대(스카이 테라스 428 등)는 동반에서 제외했다.
- 시설 날에 일반 관광지를 붙이지 못하므로 시설 단독 날(1곳)이 생길 수 있다. 일반 날의 6곳 초과분은 기존 `capCityDaySizes` 가 5곳으로 줄인다.
