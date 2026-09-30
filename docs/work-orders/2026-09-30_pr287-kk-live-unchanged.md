# 작업 지시서 — #287 검증: v22 는 떠 있습니다. 코타키나발루는 세 번째로 그대로입니다

작성: 2026-09-30 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `d315943`(#287) 배포 후 실측 (캐시 우회). AutoPipeline 초안의 지도 URL 이 `/course-maps/overseas/세부/7/v22.png` → **v22 배포 확인**

---

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-09-30_pr287-kk-live-unchanged.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

---

## 1. 실측

```
코타키나발루 d3   7곳 · 5.5km      ← v20 · v21 · v22 모두 동일
  d1  탄중 리팟 해변 → WOORI BBQ → Guan's Kopitiam Gaya Street
  d2  Poin Reflexology Spa → KK Garden Seafood Restaurant • Sedco →BOAT→ 사피 섬
  d3  탄중 아루                                        ← 1곳
세부 d7          21곳 · 140.1km · 섬 없음 (island hopping 검색 추가 후에도)
경주 · 서울 · 부산  대표 명소 유지 · 선착장/배 0              ✅
```

**단위 테스트에서 "expected 1 to be ≥ 2" 가 고쳐졌는데 라이브는 여전히 1곳입니다.**
버전이 올라 캐시가 새로 만들어졌는데도 결과가 한 글자도 안 바뀐다는 건, 라이브 KK 가 **`composeResortDays` 를 안 타는 경로**로 만들어지고 있을 가능성이 가장 큽니다.

## 2. ★★★ 할 것 — 코드 추가 전에 경로부터 확정

1. KK 요청이 어느 분기로 가는지 코드로 추적 (style 판정 · resort 분기 · 조기 반환 · 422 폴백 · 다른 생성 함수)
   - `regions` API 에서 코타키나발루의 `style` 이 실제로 `resort` 인지
   - 스팟이 적을 때 타는 폴백 경로가 따로 있는지 (7곳은 resort 최소 days×2=6 근처)
2. 진입 로그 1줄을 **조건 없이** 요청 처음에 추가: `[courseBrief] enter region=… days=… style=… version=…`
   및 분기마다 `[courseBrief] path=…`
3. 동근님이 배포 후 Vercel 로그를 붙여줄 수 있도록, 필터할 문자열을 보고서 맨 위에 적을 것

추측 수정은 더 하지 마세요. 세 번 연속 라이브에서 효과가 없었습니다.

## 3. 세부 섬

`island hopping` 검색 결과 후보 이름을 같은 로그에 남겨 주세요(`names=[…]`). 후보가 0 인지, 있는데 필터에서 빠지는지 로그로 가릅니다.

---

## 4. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | §2 경로 추적 + 진입/분기 로그 | 소 · **최우선** |
| 2 | §3 섬 후보 로그 | 소 |
| 3 | 로그 확인 후 원인 수정은 다음 PR | — |

## 5. Cowork 이 확인할 것

배포 후 동근님이 KK 3일 · 세부 7일을 한 번씩 호출한 뒤 Vercel 로그(`[courseBrief]`, `[courseRecommend]`)를 붙여줍니다. 그걸로 경로를 확정합니다.

---

## 처리 결과

### §2 — 경로 추적 완료 · 진입/분기 로그 추가 (원인 수정은 하지 않음 — 지시서대로)

**코드 추적 결론: KK가 `composeResortDays`를 안 타는 경로는 코드상 없다.**

- 진입점은 전부 `getCourseBrief`로 수렴한다(`course-brief`·`course-open`·`course-map` 라우트, 워밍 크론, 코스 페이지 `page.tsx`). 다른 생성 함수는 없다.
- `styleForRegion("코타키나발루")` = `resort` (`RESORT_REGIONS`에 포함, 별칭 "코타"도 같은 정본).
- 최종 브리프 캐시 키는 `content-brief:overseas:코타키나발루:3:v22` — 버전이 키에 들어가므로 v21 캐시는 읽히지 않는다.
- `buildBrief`에서 resort 분기는 조기 반환 없이 `composeResortDays`를 지난다. 422/503 폴백은 그 이후(결과 판정)에만 있다.
- 따라서 **"경로 불일치" 가설은 코드로는 지지되지 않는다.** 남는 가설은 (a) 조립은 탔지만 실제 후보 데이터에서 각 단계가 무동작 (b) 조립 이후 라우팅이 스팟을 "경로 없음"으로 빼서 되돌림 (c) 캐시/배포 경로의 예상 밖 동작이다. 정적으로는 가를 수 없어 로그를 심었다.

**Vercel 로그 필터 문자열(KK 3일 · 세부 7일 각 1회 호출 후):**
`[courseBrief]` · `[courseRecommend] fetchLandmarkCandidates`

읽는 순서(한 요청 기준):
1. `[courseBrief] route=… region=… days=…` 요청이 어느 라우트로 들어왔나
2. `[courseBrief] enter raw=… region=… days=… style=… version=…` **조건 없이** 1줄 (style이 resort인지, version이 22인지)
3. `[courseBrief] path=cache-hit …` 또는 `path=cache-miss` → `path=build-start` → `path=buildBrief …`
4. `path=days-generated counts=[…]` 날짜별 후보 수 (생성 직후)
5. `path=resort-compose before=[…]` → `[courseBrief] resort compose … start|end` (일자별 스팟 이름) → `path=composed counts=[…]`
6. `path=post-route-rebalance routed=[…] after=[…] changed=[…]` (라우팅 후 재배분)
7. `path=assembled dayCounts=[…] spots=N km=… cacheable=…` 최종
8. 세부 섬: `[courseRecommend] fetchLandmarkCandidates … islandSearch: basic=N names=[…] hopping=N names=[…] dropped=[이름(사유)]` (`*`는 섬 판정)
9. 선착장/앵커: `ensureJettyBeforeIslands`, `ensureResortLandmarkAnchors` (이전 PR에서 추가)

이 로그로 `composed counts`가 [3,3,1] 그대로인지(조립 무동작), `assembled`에서 줄어드는지(라우팅 제거), `enter` 자체가 v22가 아닌지를 바로 가른다.

### §3 — 섬 후보 로그 추가
`{도시} island`·`{도시} island hopping` 각각의 원본 이름 상위 12개, 섬 판정(`*`), 필터 탈락 후보와 사유(invalid / quality / agency / transit / venue / region-itself)를 남긴다. 0건인지, 있는데 필터에서 빠지는지 로그로 갈린다.

### 검증 관련 메모
이 세션은 프로덕션·라이브 API에 접근할 수 없다. 이번 PR은 로그 추가뿐이며 동작(스팟 선정·배치)은 바꾸지 않았다. `COURSE_ALGO_VERSION`은 올리지 않았다(결과가 바뀌지 않으므로).
