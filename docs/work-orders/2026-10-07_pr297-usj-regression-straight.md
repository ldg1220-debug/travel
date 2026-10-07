# 작업 지시서 — #297 검증: 이번엔 USJ · 디즈니랜드가 종일시설에서 빠졌습니다 · 일본은 코스 전체가 "직선거리"

작성: 2026-10-07 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `aea8584`(#297) v31 라이브 실측 15:43 KST + **Vercel 로그 직접 판독**(오사카 d2)

---

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-07_pr297-usj-regression-straight.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

---

## 1. ★ 된 것

```
해유관 · SEA LIFE · 타롱가 — facilityDay 없음 · 일반 명소                         ✅
시드니 d3  15곳 [5,5,5] · 오페라 하우스 · 하버 브리지 · 브리지클라임              ✅
세부 · 서울 · 경주 · KK                                                          ✅ 회귀 없음
```

## 2. ★★★ 회귀 — USJ · 디즈니랜드가 종일시설로 판정되지 않습니다

```
오사카 d2   d2  유니버설 스튜디오 재팬 · 해유관 · 하루카스 300 · 오사카 성 · 모헤지 우메다   ← USJ 날에 5곳
오사카 d3   d3  신세카이 · 쓰텐카쿠 · 아베노하루카스 · 유니버설 스튜디오 재팬 · 해유관
도쿄 d2     d1  센소지 · 스카이트리 · 신주쿠 교엔 · 츠지타 긴자 · 도쿄 디즈니랜드         ← 5번째에 디즈니
도쿄 d3     d3  … · 도쿄 디즈니랜드
facilityDay 표시 0건 (v30 에서는 USJ · 디즈니랜드에 있었음)

로그 (오사카 d2, 06:44:13 UTC)
  path=city-realloc in=[7,7] generated=14 … facilities=[]          ← USJ 가 시설 목록에 없음
```

#297 에서 판정을 "테마파크 **타입** AND (리뷰 3만 또는 이름 사전)" 으로 바꾸면서, USJ · 디즈니랜드의 Google 타입이 `amusement_park`/`theme_park` 가 아니면(예: `tourist_attraction`) 이름 사전에 있어도 탈락하게 됐습니다.

```
종일시설 = (이름 사전 일치)  OR  (테마파크 타입 AND 리뷰 3만 이상)
이름 사전은 정확한 이름 매칭(부분 문자열 시 "디즈니 스토어" 류 제외 — 스토어/숍/샵/카페 접미사 배제)
회귀 테스트: 실제 응답의 USJ · 도쿄 디즈니랜드 타입 값으로 fixture
```

## 3. ★★ 일본 · KK 는 코스 전체가 "직선거리" 로 나갑니다

```
distanceSource   오사카 d2·d3 straight · 도쿄 d2·d3 straight · KK d3 straight
                 서울 · 경주 · 세부 · 시드니 route
로그  [warn] overseas/오사카 코스의 일부 구간이 실제 경로를 못 구해 직선거리로 대체됐습니다 (distanceSource "straight")
```

**일부 구간** 실패인데 **코스 전체**가 straight 로 표시됩니다. AutoPipeline 은 straight 코스면 모든 이동 분을 지웁니다(추정값이라서) → 오사카 · 도쿄 글에 이동 시간이 하나도 없습니다.

```
① 구간별 표시: spots[i].toNextSource = "route" | "straight"  (실패한 구간만 straight + toNextEstimated true)
   코스 단위 distanceSource 는 "mixed" 추가 (전부 route 면 route, 전부 straight 면 straight)
② 실패 원인 로그: 실패 구간마다 [courseBrief] route-fail from= to= mode= status=(ZERO_RESULTS 등)
③ 일본에서 실패가 많다면 mode 폴백 순서 확인 (transit → walking → driving)
```

## 4. ★ 소음 로그

```
[error] city-realloc 용량 초과로 스팟 2곳을 버렸습니다(그릇 공식 점검 필요)
```

2일 × 5곳 = 10 을 넘는 14곳에서 4곳을 버리는 건 정상 동작입니다. 총량이 도시형 최소(days×3) 이상이면 `info` 로 낮춰 주세요.

## 5. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | §2 이름 사전 단독 인정 | 극소 · **최우선** |
| 2 | §3 구간별 경로 출처 · 실패 원인 로그 | 소 |
| 3 | §4 로그 레벨 | 극소 |
| 4 | `COURSE_ALGO_VERSION` 31 → 32 | 극소 |

## 6. 배포 후 Cowork 이 확인할 것 (응답 + 로그)

| 항목 | 기대 |
|---|---|
| 오사카 d2 · d3 | USJ facilityDay · 단독(또는 동반 ≤2) · 해유관 일반 날 |
| 도쿄 d2 · d3 | 디즈니랜드 facilityDay |
| 오사카 · 도쿄 · KK | distanceSource mixed/route · 실패 구간만 toNextSource straight · route-fail 로그로 원인 확인 |

---

## 처리 결과

### §2 — 완료 (이름 사전 단독 인정) — 내 #297 변경이 만든 회귀였다
- **원인**: #297에서 종일시설을 "테마파크 타입 AND (리뷰 3만 또는 이름 사전)"으로 묶었다. USJ·디즈니랜드의 Google 타입이 `amusement_park`/`theme_park`가 아니면 사전에 있어도 탈락한다(`facilities=[]`). 로그와 지시서 진단이 맞다. **실제 응답의 타입 값은 이번에도 전달되지 않아 확인하지 못했다.**
- **수정**: 종일시설 = (이름 사전 일치 — 타입 무관) **OR** (테마파크 타입 AND 리뷰 3만 이상). `aquarium`·`zoo` 타입은 사전에 이름이 있어도 아니다.
- **지시서와 다르게 한 것**: 지시서의 "정확한 이름 매칭" 대신 **부분 문자열 + 제외어**를 택했다 — 한글/영문 표기가 다양해("유니버설 스튜디오 재팬"·"Universal Studios Japan"·"USJ"·"도쿄 디즈니랜드"·"Tokyo DisneySea") 정확 일치 목록으로는 놓친다. 제외어: 스토어·store·shop·숍·샵·카페·호텔·hotel·리조트 라인·line·스테이션·버스·시티워크·타워·스카이·몰·mall·아쿠아리움·레스토랑·식당·아울렛, 그리고 음식점·숙소 같은 시설 유형 category. 지시서가 든 접미사(스토어/숍/샵/카페)보다 넓다 — "롯데월드타워 서울스카이"·"롯데월드몰"·"도쿄 디즈니랜드 호텔"·"유니버설 시티워크"가 사전의 부분 문자열에 걸리기 때문이다. 사전은 수족관·동물원 이름(해유관·SEA LIFE·타롱가)을 #297에서 이미 뺐다.
- **영향 — 국내**: 사전이 타입과 무관해져 국내(Kakao, 타입 없음)에서도 롯데월드 어드벤처·에버랜드·서울랜드가 종일시설이 된다(이전엔 타입이 없어 영향 없었다). 지시서가 사전 예시에 롯데월드·에버랜드를 든 취지에 맞춘 것이지만 서울·용인 코스의 모양이 바뀔 수 있다.
- **회귀 테스트**: "실제 응답의 USJ·도쿄 디즈니랜드 타입 값으로 fixture"는 값을 몰라 불가능했다. 대신 가능한 타입(amusement_park·theme_park·tourist_attraction·point_of_interest·establishment·park·event_venue·빈 값) 전부에서 USJ·디즈니랜드·디즈니씨가 시설로 인식되는지를 `it.each`로 고정했다. 실제 타입이 전달되면 fixture를 그 값으로 교체한다. 판정 단일화 단언 표에도 "타입이 테마파크가 아닌 USJ·디즈니랜드" 사례를 더했다.

### §3 — 완료 (구간별 출처 · mixed · 실패 로그 · 폴백)
- ① **구간별 출처**: `spots[i].toNextSource = "route" | "straight"`(순수 추가 필드, 하루 마지막 스팟은 없음). `straight`는 `toNextEstimated: true`와 항상 함께다(배편 구간 포함). 국내 도보의 의도된 직선은 `toNextEstimated`와 같은 판정으로 `route`다.
- **코스 단위 `distanceSource`에 `"mixed"` 추가**: 배편을 뺀 구간이 전부 실제 경로면 `route`, 전부 직선이면 `straight`, 섞이면 `mixed`. 구간이 없으면 `route`. **API 계약 변경**(타입 `"route" | "straight" | "mixed"`) — AutoPipeline이 `distanceSource !== "route"`를 straight로 취급하고 있다면 `mixed`를 처리하도록 바꿔야 한다. `toNextSource`가 `route`인 구간의 이동 시간은 `mixed`에서도 믿어도 된다. 평점 보강 단계의 1번 자리 맞바꿈 뒤에도 최종 spots에서 다시 계산하므로 항상 일치한다.
- ② **실패 원인 로그**: `[courseBrief] route-fail from=… to=… mode=… status=…`. status는 `ZERO_RESULTS`/`NOT_FOUND`(log)·`REQUEST_DENIED` 등 API 상태(warn, error_message 포함)·`http_<코드>`·`NO_LEGS`·`REQUEST_FAILED`. 기존의 `google directions …` 두 줄을 이 형식으로 통일했다.
- ③ **폴백**: 해외 **transit**이 `ZERO_RESULTS`거나 실패하면 **driving**으로 한 번 더 조회하고, 성공하면 구간의 이동수단을 `car`로 표시한다. **지시서의 순서(transit → walking → driving)와 다르다** — 대중교통 구간은 1~5km라 walking은 이미 1km 미만에서만 쓰이고(`modeForDistance`), 5km 걷기를 대안으로 내세우는 것보다 자동차가 낫다고 판단했다. 걷기 구간·국내는 폴백이 없다.
- **일본에서 straight가 많았던 이유는 미확정이다.** 가설: (a) 일부 구간만 실패했는데 코스 전체가 `straight`로 표시됐다(지시서 본문과 일치) (b) #293에서 해외 "경로 없음"을 삭제 대신 직선 추정으로 남기게 해(50km 이내) 이전에는 조용히 빠지던 스팟이 `straight` 구간으로 드러났다. 실제 실패 비율은 `route-fail` 로그가 와야 안다.

### §4 — 완료 (로그 레벨)
`city-realloc 용량 초과` — 남은 총량이 도시형 최소(일수 × 3) 이상이면 `info`(console.log), 미만일 때만 `error`로 올린다. 메시지는 "버렸습니다(그릇 공식 점검 필요)"에서 "뺐습니다(남은 N곳)"로 바꿨다.

### `COURSE_ALGO_VERSION` — 완료 (31→32)

### 검증 관련 메모
프로덕션 접근 불가. USJ·디즈니랜드의 실제 Google 타입, 일본 구간 실패 비율은 확인하지 못했다. 단위 테스트: 가능한 모든 타입에서 사전 인정, 곁가지(스토어·호텔·타워·몰·아쿠아리움·시티워크) 제외, 국내 사전 인정, transit→driving 폴백(fetch 모킹), route-fail 로그 형식, `toNextSource`/`mixed`.
