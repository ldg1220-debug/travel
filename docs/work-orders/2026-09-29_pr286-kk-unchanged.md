# 작업 지시서 — #286 검증: 세부 섬은 빠졌습니다. 코타키나발루는 한 글자도 안 바뀌었습니다

작성: 2026-09-29 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `5acb397`(#286) 배포분 실측 (캐시 우회). 마지막 스팟 `toNextMode: null` 이 보이므로 v21 이 떠 있는 상태입니다.

---

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-09-29_pr286-kk-unchanged.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

---

## 1. ★★ 된 것

```
세부 d7        "세부 섬" 없음 · 오션젯 항구 없음 · 배 구간 없음                     ✅
각 날 마지막     toNextMode: null (5개 지역 전부)                                 ✅
경주 d3        동궁과 월지 · 첨성대 · 불국사 · 11곳                               ✅
서울 d2        N서울타워 · 북촌 · 창덕궁 · 덕수궁                                 ✅
부산 d2        감천 · 오륙도 · 해동용궁사 · 광안리                                 ✅
```

---

## 2. ★★★ 코타키나발루 d3 — v20 과 똑같습니다

```
d1  탄중 리팟 해변 →transit 14→ WOORI BBQ →walk 12→ Guan's Kopitiam Gaya Street
d2  Poin Reflexology Spa →walk 8→ KK Garden Seafood Restaurant • Sedco →BOAT→ 사피 섬     ← 선착장 없음
d3  탄중 아루                                                                           ← 1곳
7곳 · 5.5km (v20 과 거리까지 동일)
```

선착장 재사용도, 얇은 날 보충도 작동하지 않았습니다. 새 코드 경로가 이 입력에서 **아예 안 탔을** 가능성이 큽니다
(예: 휴양형 분기 조건 불충족 · 앵커/보충 단계 전에 조기 반환 · KK 가 다른 경로로 생성).

### 할 것 — 추측 전에 로그로 가르기

동근님이 Vercel 로그에서 아래를 필터해 붙여줄 예정입니다(15:4x 요청분). 그걸로 판단하세요.

```
[courseBrief] ensureJettyBeforeIslands   candidates · jetties · reused · placed
[courseBrief] ensureResortLandmarkAnchors  anchors
```

- 로그 자체가 없음 → 해당 함수가 호출되지 않음. 호출 경로를 KK 입력으로 추적
- jetties=0 → 선착장 전용 검색 쿼리가 KK 에서 0건. 쿼리("Kota Kinabalu jetty", "Jesselton Point", "마누칸 선착장")를 로그에 남기고 넓히기
- placed=0 인데 jetties>0 → 삽입 조건 버그

그리고:

```
KK 전용 회귀 테스트: 라이브 응답을 fixture 로 저장(후보 풀 · 선착장 검색 결과)해서
  "사피 섬 앞 = 선착장" · "하루 ≥ 2곳" · "총 ≥ 8곳" 을 단언
```

단위 테스트 612개가 다 통과했는데 라이브가 그대로인 건, 테스트 입력이 실제 KK 후보와 다르다는 뜻입니다.

---

## 3. ★★ 세부 7일에 섬이 없습니다

```
v19  Caohagan Island (힐튼 선착장 → 배)
v20  세부 섬 (잘못)
v21  섬 없음 — 해변 1곳(수바-배즈바스)
```

#283 §3 "휴양형 앵커 1곳 = 섬/해변" 은 해변으로 채워진 것으로 보입니다. 세부는 섬 투어가 핵심이라 섬 우선이 맞습니다.

```
휴양형 앵커 예약 자리:  섬 후보(부속 섬) 있으면 섬 → 없으면 해변
세부 기대: Caohagan · 날루수안 · 힐루뚱안 · 판다논 중 1곳 + 그 앞 선착장
```

**발행 차단 사유는 아닙니다.** 지금 세부 코스는 사실관계상 틀린 곳이 없습니다.

---

## 4. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | §2 로그로 원인 가르기 → 수정 · KK fixture 테스트 | 소~중 · **최우선** |
| 2 | §3 섬 우선 앵커 | 소 |
| 3 | `COURSE_ALGO_VERSION` 21 → 22 | 소 |

---

## 5. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| 코타키나발루 d3 | 선착장 → 배 → 사피 섬 · 8곳 이상 · 하루 2곳 이상 |
| 세부 d7 | 부속 섬 1곳 + 선착장 · "세부 섬" 없음 |
| 경주 · 서울 · 부산 | 회귀 없음 |

---

## 처리 결과

### §2 — 부분 완료 (실제 버그 1건 수정, 선착장 미삽입 원인은 **미확정**)

**Vercel 로그가 아직 없어 "선착장이 왜 안 들어갔는지"는 확정하지 못했다.** 확정 못 한 것을 확정한 것처럼 적지 않는다.

- **찾아 고친 버그**: `redistributeThinResortDays`·`balanceSightsAcrossDays`가
  가장 큰 날 *하나만* 기증일로 보고, 거기서 옮길 게 없으면 포기했다. KK 입력
  (d1 = 해변+식사 2, d2 = 스파+식사+섬)에서는 가장 큰 날(둘 다 3곳)에 옮길 스팟이
  없어 d3(탄중 아루 1곳)가 그대로 남았다. 재배치 전·후 두 번의 재배분이 모두
  무동작이었으므로 "v20과 거리까지 동일"과 부합한다. 이제 후보 기증일을 큰 순서로
  전부 순회한다.
- **선착장 미삽입**: 후보 0건인지, 선착장 판정 실패인지, 배치 조건인지 로그로만 가를
  수 있다. 다음 로그를 추가했다(붙여주시면 판단):
  - `[courseBrief] ensureJettyBeforeIslands <scope/지역>: islands / lacking / reusable / afterReuse`
  - `[courseBrief] ensureJettyBeforeIslands <scope/지역> "<검색어>": candidates / jetties / names(선착장 판정 *) / placed`
  - `[courseBrief] ensureResortLandmarkAnchors …: candidates / needyDays / top(리뷰수·in-course·island) / anchors`
  - `[courseBrief] resort compose … start|end`: 단계 전후 일자별 스팟 이름
  - `[courseRecommend] fetchLandmarkCandidates …`: islandRaw / islandGated / islands
- **KK 회귀 테스트**: 조립 파이프라인을 `composeResortDays(geoOrderedDays, {fetchLandmarks, fetchSlot})`
  로 분리(검색 함수 주입)해 라이브 호출 없이 전체를 돌린다. KK 입력으로
  "사피 섬 앞 = 선착장", "하루 ≥ 2곳", "총 ≥ 8곳", 후보가 전부 비어도 "하루 ≥ 2곳"을
  단언한다. **fixture는 라이브 응답을 저장한 것이 아니라 보고된 결과로 모델링한 것**이다
  (이 세션은 라이브 API 접근이 없다). 진짜 fixture는 위 로그의 names 값을 붙여주시면 교체한다.

### §3 — 부분 완료

- 휴양형 앵커의 "섬 1곳 예약(없으면 명소·해변)"은 v21에도 있었다. 세부에서 섬이 없었던
  이유는 예약 로직이 아니라 **섬 후보 자체가 없었을** 가능성이 크다("세부 island" 검색이
  "세부 섬"과 본섬 장소로 채워짐). `"{도시} island hopping"` 검색을 별도 캐시 키
  (`landmark-island-hopping:`)로 추가했다. 실제로 카오하간·날루수안·힐루뚱안·판다논이
  잡히는지는 라이브로 확인하지 못했다.
- 섬 후보가 끝내 없으면 해변 등 일반 앵커로 채워지는 동작은 그대로다.

### `COURSE_ALGO_VERSION` — 완료 (21→22)
