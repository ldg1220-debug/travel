# 작업 지시서 — Vercel 로그 판독 결과: 원인 둘 확정 (재배치가 스팟을 버림 · 라우팅이 선착장을 버림)

작성: 2026-10-01 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: **Cowork 이 Vercel 런타임 로그를 직접 판독** (v26, 10:36:39 · 10:50:26 KST 요청분). 이제부터 로그는 Cowork 이 직접 봅니다.

---

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-01_log-realloc-drops-spots.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

---

## 1. ★★★ 원인 A — 도시형 "재배치(reallocated)" 단계가 스팟을 버립니다 (시드니 3·4일 · 오사카)

```
시드니 d3 (10:50:27)
  days-generated   [7,7,7]   = 21
  city-anchors before [6,1,1] = 8        ← 여기서 13곳 증발
  composed         [3,3,2]
  totals  generated 21  reallocated 8  composed 8  routed 8  final 8   → 422 (8 < 9)

오사카 d2 (10:50:27)
  days-generated   [7,7]     = 14
  city-anchors before [1,1]  = 2         ← 12곳 증발
  fetchLandmarkCandidates raw 20 gated 19   ← 앵커 후보 19곳이 있는데 안 들어감
  totals  generated 14  reallocated 2  …  final 2                       → 422 (2 < 6)
```

`days-generated` 와 `city-anchors` 사이 = 도시형 재배치(종일시설 날 처리 · `balanceCityDayGroups`).
**종일시설 날을 "시설 1곳" 으로 줄이면서 나머지를 다른 날로 옮기지 않고 버리는 것**으로 읽힙니다. 오사카는 이틀 모두 시설 날(USJ · 가이유칸 류)로 판정돼 [1,1].
시드니 d4 가 10:36 엔 422, 10:50 엔 200 인 것도 생성마다 시설 날 판정이 달라지기 때문으로 보입니다.

### 고칠 것

```
① 재배치는 스팟을 옮기기만 — 시설 날에서 빠지는 스팟은 다른 날 후보로 넘기고, 받을 날이 없으면 시설 날 동반(최대 2)으로 남김
   총합 불변 단언: reallocated == generated (아니면 오류 로그 + 입력 사용)
② 종일시설 날은 코스 일수의 절반 이하 (2일 코스면 최대 1일 · 3일이면 1일 · 5일이면 2일)
   초과 시 리뷰 적은 시설은 일반 스팟으로 취급
③ city-anchors 는 "before" 가 threshold 미만이면 앵커 후보(오사카 19곳)로 채우기
④ 재배치 단계 로그: path=city-realloc in=[…] facilityDays=[…] moved=N dropped=[이름]
```

## 2. ★★★ 원인 B — 휴양형 라우팅이 "경로 없음" 으로 선착장을 버립니다 (코타키나발루)

```
코타키나발루 d3 (10:36:39)
  resort compose end   [필리피노 마켓 / WOORI BBQ / Guan's] [Poin Spa / KK Garden Seafood / 제셀톤 선착장 / 사피 섬] [Star Marina / 탄중 아루 / 탄중 리팟 해변]   = 10곳 ✅
  ensureJettyBeforeIslands  islands [사피 섬] reusable [제셀톤 선착장]   ✅ 넣음
  경로 없음으로 코스에서 빠진 스팟: 필리피노 마켓 · Star Marina · 제셀톤 선착장       ← 라우팅이 3곳 삭제
  totals  generated 9  reallocated 7  composed 10  routed 7  final 7
```

**조립은 완벽했는데 라우팅이 지웠습니다.** 선착장이 빠지니 "식당 →BOAT→ 섬" 이 되고, 3일차는 Star Marina 가 빠져 1곳이 됐습니다.
(제셀톤 선착장 · Star Marina 는 항구 부지라 도로 경로 API 가 실패하는 것으로 보입니다.)

### 고칠 것

```
⑤ 경로 없음이면 삭제하지 말고 직선거리 추정 구간으로 유지 (distanceSource "straight", toNextEstimated true)
   — 이미 "직선거리로 대체" 로직이 있으니 그걸 스팟 삭제 대신 사용
⑥ 선착장 · 섬 · 앵커는 라우팅에서 절대 삭제 금지
⑦ 라우팅 후 하루 2곳 미만이면 post-route-rebalance 가 실제로 옮기도록 (지금 changed [false…])
```

## 3. ★ 부수 — 422 응답에도 지도 생성을 시도해 Blob 오류

```
[error] course map generation failed: Vercel Blob: This blob already exists, use allowOverwrite: true
```

422(cacheable false)일 때는 지도 생성을 건너뛰거나 `allowOverwrite: true`. 에러 로그 소음입니다.

## 4. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | ⑤⑥ 라우팅 삭제 금지 (KK) | 소 · **최우선** |
| 2 | ①②③ 재배치 총합 불변 · 시설 날 상한 · 앵커 보충 (시드니 · 오사카) | 소~중 |
| 3 | ④ 재배치 로그 · ⑦ | 소 |
| 4 | §3 Blob 오류 | 극소 |
| 5 | `COURSE_ALGO_VERSION` 26 → 27 | 극소 |

## 5. 배포 후 Cowork 이 확인할 것 (응답 + 로그 둘 다 직접)

| 항목 | 기대 |
|---|---|
| KK d3 | 10곳 내외 · 제셀톤 선착장 → 배 → 사피 섬 · 로그 "경로 없음으로 빠진 스팟" 0 |
| 시드니 d3 · d4 | 200 · 로그 reallocated == generated |
| 오사카 d2 · d3 | 200 · 시설 날 1일 이하 |
| 서울 · 부산 · 경주 · 세부 | 회귀 없음 |

---

## 처리 결과

### 원인 A — 도시형 재배치가 스팟을 버림 (시드니 d3·d4 · 오사카) — 완료
**코드로 확인한 정확한 원인**: `reallocateStopsByDay`의 `trimToCapacity(비시설 스팟, maxNonFacilityCapacity(days, 시설 수))`. 이 그릇 공식은 "시설 날 = 시설 1곳, 일반 날 = 6곳"이라 (일반 날 수 × 6)만 담았다. 3일 코스에 시설 2곳이면 일반 날 1일 = 6곳 → 21곳 중 13곳을 `trimToCapacity`가 버려 `[6,1,1]`(시드니 d3), 2일 코스에 시설 2곳이면 일반 날 0일 = 용량 0 → `[1,1]`(오사카 d2). 지시서의 "시설 날 처리 · balanceCityDayGroups"는 아니었다(`balanceCityDayGroups`는 그 뒤 단계). 생성마다 시설 개수가 달라 같은 지역이 때로 200·때로 422였다.
- ① **그릇 공식**: 시설 날의 동반 자리(최대 2곳)를 그릇에 포함 — `일반 날 × 6 + 시설 날 × 2`. 뒤 단계(`rebalanceCityDays`)가 시설 날로 옮긴다. 용량 초과로 버리는 일이 생기면 오류 로그(`city-realloc 용량 초과로 …`)가 남는다.
- ② **시설 날 상한**: `maxFacilityDays` = 코스 일수의 절반 이하(2→1, 3→1, 4→2, 5→2). 초과분은 인기(평점×리뷰)가 낮은 시설부터 `facilityDemoted`(일반 스팟 취급)로 바꿔 시설 날 규칙(`isDayFacility`)에서 뺀다. 그 스팟은 코스에 그대로 남는다.
- ③ **앵커 보충**: 재배치 뒤 총량이 도시형 최소(`minViableSpots`)에 못 미치면(`deficit`) 앵커 후보로 모자란 만큼 "추가"한다(가장 스팟 적고 상한에 여유 있는 날; 시설 날은 3곳까지). 평소 앵커는 기존대로 "교체". `placeCityAnchors`(순수 함수)로 분리해 테스트.
- ④ **로그**: `path=city-realloc in=[…] generated= deduped= facilities=[…] demoted=[…] dedupeDropped=[…] trimmed=[…]`, `path=city-anchors … before= minTotal= deficit= candidates= anchors=`.
- **지시서와 다르게 한 것**: "reallocated == generated 단언 후 오류 로그 + 입력 사용"은 그대로 못 한다 — 중복 제거(`dedupeByProximity`·`dedupeByBrand`)로 줄어드는 것은 정상이라 단순 동치 단언이 거짓 경보가 된다. 대신 중복 제거로 줄어든 이름(`dedupeDropped`)과 용량 초과로 버린 이름(`trimmed`)을 분리해 로그로 남기고, 후자는 오류 로그로 올린다(공식상 0이어야 한다).
- **함께 찾은 크래시**: 그릇 공식을 고치자 시설 1곳 + 일반 날 1일(오사카 2일 등) 구성이 처음으로 `enforceChunkCap`에 단일 그룹으로 들어가 `ranked[0]`이 undefined가 되는 TypeError가 났다(이전엔 용량 0으로 이 경로에 안 닿았다). 그룹이 하나뿐이면 그대로 돌려주는 가드를 넣었다.

### 원인 B — 휴양형 라우팅이 선착장을 삭제 (코타키나발루) — 완료
- ⑤⑥ `routeDayStops`: "경로 없음"이어도 **선착장·섬·대표 명소 앵커·종일시설·해변은 삭제하지 않고** 직선 추정 구간으로 둔다(`distanceSource "straight"`, 회색 경로선, `toNextEstimated`). 해외는 비보호 스팟도 50km 이내면 같은 방식으로 직선 추정으로 둔다(Google "경로 없음"이 항구·도심 보행 불가 구역에서도 나와 확정적이지 않다).
- **지시서와 다르게 한 것**: ⑤는 "경로 없음이면 삭제하지 말고"로 일반화돼 있지만, **국내 비보호 스팟은 기존 규칙(사량도처럼 Kakao 확정 응답이면 삭제)을 유지**했다. 해외도 50km 초과는 삭제한다(이전의 "3시간 초과" 상한 취지).
- ⑦ post-route-rebalance가 옮기지 않던 건(`changed [false…]`)은 라우팅이 스팟을 지운 결과 얇아진 날을 못 메운 것이다. 라우팅이 보호 스팟을 더는 지우지 않으므로 별도 수정은 하지 않았다 — 라이브 확인 필요.

### §3 Blob 오류 — 완료
`put`에 `allowOverwrite: true`를 추가했다. 캐시하지 않는(=422로 갈) 결과는 지도 생성을 건너뛴다.

### `COURSE_ALGO_VERSION` — 완료 (26→27)

### 검증 관련 메모
프로덕션 접근 불가. 시드니·오사카 fixture는 로그의 개수·구성(시드니 [7,7,7]+시설 2, 오사카 [7,7]+시설 2)을 모델링한 것이다. 시드니 d4가 10:36엔 422, 10:50엔 200이던 변동은 시설 판정이 생성마다 달라서라는 해석과 코드 원인이 일치한다.
