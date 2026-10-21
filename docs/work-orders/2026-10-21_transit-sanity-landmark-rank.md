# 작업 지시서 — 3km 구간 대중교통 59분 · "다리"가 기타 · 대표 명소 순위 필드

작성: 2026-10-21 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: AutoPipeline 284(오사카) 점검 + Cowork course-brief 오사카 3 실측
**`TRADULE_2026-10-21_PR333_검증_봇재빌드·순서규칙.md` 와 같은 PR 로 묶어도 됨 (버전 +1 은 한 번만).**

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-21_transit-sanity-landmark-rank.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 1. 실측 (오사카 3일)

```
1: 해유관[수족관] →car19 · 도톤보리 →walk12 · 릴로 커피 →walk9 · 오니기리 고리짱
2: 고쿠라쿠바시 다리[기타] 34.689,135.527 →transit59 · gogobebe 34.666,135.508 →walk3 · 구로몬 시장 · 신세카이 시장 · 하루카스 300
3: USJ
```

## 2. 할 것

```
① 이동시간 상식 검사: 직선거리 d 에 대해
   transit 분 > max(25, d_km × 12) 이거나 transit 분 > walk 추정(d_km × 15) 이면 Directions transit 결과를 버리고
   d ≤ 2km → 도보 추정, 그 외 → 차량(택시) 추정  (toNextFallback 표기 유지)
   위 구간(약 2.9km): transit 59 → 차량 약 10~12분 또는 도보 약 40분 중 규칙대로
   로그 [courseBrief] transit-sanity from= to= km= transit= → mode= min=
② 카테고리: 이름/타입에 다리·교·bridge·Bashi(橋) → "명소" (기타 금지) · 대관람차 등 기존 사전 유지
③ course-brief spots[] 에 landmarkRank(정수, 없으면 생략) 추가
   = 그 지역 랜드마크 풀(관광 명소 질의) 응답 순서 1,2,3… — 평점이 없어진 뒤 "대표성" 신호
   AutoPipeline 이 제목·FAQ 대표 명소로 가장 작은 값을 씀 (오사카면 도톤보리/오사카 성 급)
④ 랜드마크 보장(#331 지시 ⑥) 이 오사카에서 오사카 성을 빠뜨림 — v42 오사카 3일에 오사카 성 없음. 상위 랜드마크 days 개 포함 규칙 재확인
```

## 3. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| course-brief 오사카3 | 59분 같은 비정상 transit 없음 · 다리 "명소" · landmarkRank 있음 · 오사카 성 또는 도톤보리 rank 1~2 |

---

## 처리 결과 (2026-10-21)

- §2① 대중교통 상식 검사: `routeSegment` 의 기존 이상치 규칙(직선 3km 이하 · 50분 이상)을 일반화 — transit 분 > max(25, d×12) 이거나 > 도보 추정(d×15)이면 Directions transit 결과를 버린다. 실측 구간(고쿠라쿠바시 → gogobebe)은 직선 약 3.1km 라 예전 "3km 이하" 선 바로 밖에서 빠져나갔다. 버린 뒤 d ≤ 2km 는 도보(Directions walking), 그 밖은 차량(Directions driving), 실제 경로를 못 구하면 직선 기반 추정. 차량으로 바뀐 구간은 `toNextFallback: "driving"` 표기 유지. 로그 `[courseBrief] transit-sanity from= to= km= transit= → mode= min=`. (구 로그 `route-outlier` 는 이 로그로 대체.)
- §2② 카테고리: 이름에 다리·대교·Bridge·Bashi·橋 가 있으면 "관광지"(기타 금지). 음식 단어(닭다리·식당 등)는 음식점, "다리미"처럼 한글이 이어지는 단어는 다리가 아니다. Tower Bridge 는 전망대 규칙보다 다리가 먼저.
- §2③ `spots[].landmarkRank`(정수, 없으면 생략): 그 지역 랜드마크 풀(`{지역} 관광명소` 질의, 후보 캐시에서 읽음)에서의 응답 순서 1,2,3…. 풀의 장소와 id 가 같거나 같은 자리(300m 안 + 이름 포함)면 같은 장소. 로그 `path=landmark-rank pool= matched=`.
- §2④ 랜드마크 보장: 코드상 규칙은 "풀 상위 N(max(3, days))개 중 코스에 없는 것을 순위대로 앵커로 넣는다(하루 1곳, 종일시설 날 제외)"로 이미 있다. 오사카 3일에 오사카 성이 빠진 원인은 코드만으로 특정하지 못했다 — 풀 순위가 깊거나(상위 6 밖), 3일 중 1일이 USJ 시설 날이라 앵커 자리가 2곳뿐인 경우를 의심한다. 확인용으로 `city-anchors` 로그에 풀 상위 10(`pool=[1:… | 2:…]`)을 추가했다.
- `COURSE_ALGO_VERSION` 43 → 44(같은 PR 로 묶는 지시라 한 번만).
