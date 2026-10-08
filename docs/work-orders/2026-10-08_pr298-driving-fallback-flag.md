# 작업 지시서 — #298 검증: 전부 route · 종일시설 정상. 차량 폴백 구간만 표시해 주세요

작성: 2026-10-08 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `a11ae61`(#298) v32 라이브 실측 15:22 KST (11개 지역/일수)

---

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-08_pr298-driving-fallback-flag.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

---

## 1. ★★★ 된 것 — 지금까지 중 가장 좋은 상태입니다

```
facilityDay   오사카 USJ · 도쿄 디즈니랜드 · 서울 롯데월드 어드벤처 · 나고야 레고랜드 재팬     ✅
              해유관 · SEA LIFE · 히가시야마 동식물원은 일반                                     ✅
distanceSource 오사카 · 도쿄 · 나고야 · 시드니 · 서울 · 경주 · 세부 · KK 모두 route              ✅ (어제 일본 전부 straight)
straight 구간  세부 · KK 의 배 구간(선착장↔섬)만                                                ✅ 정상
```

서울 3일은 롯데월드가 3일차 단독이 되면서 총 11곳 [5,5,1] 입니다. 국내 사전 인정 영향으로 예상한 그대로입니다.

## 2. ★★ 일본은 대중교통이 전부 "차량" 으로 바뀌었습니다

```
toNextMode 분포   도쿄 d3  car 7 · walk 1 · transit 0
                  나고야 d3 car 7 · walk 2
                  오사카 d3 car 2 · transit 2 · walk 5
                  (시드니 d3 transit 3 · car 1 · walk 8 — 정상)
```

#298 §3③ 폴백(transit 실패 → driving)으로 경로는 생겼지만, 도쿄 여행자에게 "차량 30분" 은 실제 이동과 다릅니다(Google Directions API 는 일본 대중교통 데이터를 거의 주지 않습니다).
시간 자체는 참고값으로 유효하니 지우지 말고 **폴백이었다는 사실만 표시**하세요.

```
spots[i].toNextFallback = "driving"   (transit 실패 후 driving 으로 구한 구간에만)
route-fail 로그는 폴백 성공 시에도 1줄 (status=ZERO_RESULTS fallback=driving ok) — 실패 비율 집계용
```

## 3. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | §2 toNextFallback 표시 · 폴백 로그 | 극소 |
| 2 | 버전 유지(응답 필드 추가뿐) — 단, 캐시된 v32 에는 필드가 없으므로 32 → 33 | 극소 |

## 4. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| 도쿄 · 나고야 · 오사카 | car 구간 중 폴백 구간에 toNextFallback "driving" |
| 시드니 · 서울 | toNextFallback 없음 |
| 로그 | route-fail … fallback=driving ok 집계 가능 |

---

## 처리 결과

### §2 — 완료 (폴백 구간 표시 · 로그)
- `spots[i].toNextFallback = "driving"`(순수 추가 필드): 해외 transit 조회가 실패해 driving으로 구한 구간에만 붙는다. 처음부터 transit이 성공한 구간(시드니 류)·걷기·국내·배편에는 필드가 없다. 시간·거리는 지우지 않는다. 평점 보강 단계의 1번 자리 맞바꿈에서도 구간 정보와 함께 움직인다.
- 로그: 폴백을 시도할 때마다 `[courseBrief] route-fail from=… to=… mode=transit status=ZERO_RESULTS|FAILED fallback=driving ok|failed` 1줄. 성공해도 남으므로 `ok`/`failed` 개수로 실패 비율을 집계할 수 있다. (transit 실패 자체는 기존 `route-fail … mode=transit status=…` 줄도 따로 남는다 — 같은 구간에 두 줄이 나오는 것이 정상이다.)
- **지시서와 다르게 한 것**: 로그 형식은 지시서 예시(`status=ZERO_RESULTS fallback=driving ok`)에 맞췄고 `mode=transit`을 앞에 붙였다. 폴백이 실패한 경우도 `failed`로 남겨 분모를 얻을 수 있게 했다.

### `COURSE_ALGO_VERSION` — 완료 (32→33)
지시서 대로 응답 필드 추가뿐이지만 캐시된 v32에는 필드가 없어 올렸다.

### 검증 관련 메모
프로덕션 접근 불가. fetch 모킹 단위 테스트: 폴백 구간 표시(`car` + `driving`), 일반 transit 구간 무표시, 둘 다 실패 시 표시 없음·`failed` 로그.
