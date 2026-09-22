# 작업 지시서 — 24개 전부 아직 404입니다 (캐시 전용 경로가 원인)

작성: 2026-09-22 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `f5d26e3` / PR #262 배포분 전수 실측

---

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-09-22_course-pages-still-404.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

---

## 1. 전수 결과

```
sitemap 코스 URL 24개  →  24개 전부 HTTP 404
```

```
경주 · 강릉 · 속초 · 여수 · 순천 · 통영 · 거제 · 전주          404
제주시 · 서귀포 · 애월 · 성산 · 중문                          404
해운대 · 광안리 · 남포동 · 춘천 · 남해 · 포항 · 안동           404
서울 · 부산 · 제주 · 인천 (신규 1박2일)                       404
```

**신규 4개뿐 아니라 기존 20개도 전부입니다.**

---

## 2. ★★★ 결정적 대조

같은 지역·같은 일수입니다.

```
/api/content/course-brief?region=경주&days=2
   →  200 · 12곳 · dayTotals[0] = {day:1, spotCount:6, distanceKm:9.6}   ✅

/course/경주/2박3일
   →  404                                                              ✗
```

**데이터는 정상입니다. 페이지만 404입니다.**

---

## 3. ★★★ 원인 — 캐시 미스를 404로 처리하고 있습니다

이번 수정에서 이렇게 하셨습니다.

> `캐시 미스 시 라이브 생성 폴백이 없는 getCachedCourseBrief 추가`
> `getCourseBrief → getCachedCourseBrief 로 교체`

```
캐시에 있으면   →  페이지 렌더
캐시에 없으면   →  notFound()
```

그리고 **캐시를 채우는 유일한 경로가 `warm-course-brief` 크론(하루 1회, 05:00 UTC)** 입니다.

```
지금 캐시가 비어 있습니다.  →  24개 전부 404
```

### 이 설계는 계속 깨집니다

```
· COURSE_ALGO_VERSION 이 오르면          →  전체 캐시 무효 → 전 페이지 404
· 캐시 TTL 이 만료되면                    →  다음 크론까지 404
· 크론이 한 번 실패하면                    →  하루 종일 404
· 새 지역을 sitemap 에 추가하면            →  다음 크론까지 404
```

**구글이 크롤링하러 온 순간 캐시가 비어 있으면 404를 받습니다.**
페이지 존재 여부가 크론 성공 여부에 묶여 있으면 안 됩니다.

---

## 4. ★★★ 무작위성은 시드로 푸세요, 폴백 제거로 풀면 안 됩니다

원인 분석은 좋았습니다.

> `courseRecommend.ts 의 랜덤 후보 선정에 진짜 무작위성이 있어
>  같은 입력에도 다른 결과가 나올 수 있었다`

**진짜 문제를 찾으셨습니다.** 다만 해법이 반대 방향이었습니다.

```
❌  라이브 생성을 제거     →  캐시 없으면 페이지가 사라짐
✅  라이브 생성을 결정론화  →  언제 만들어도 같은 결과
```

```
난수 시드를 `${region}:${days}:${COURSE_ALGO_VERSION}` 로 고정
  → generateMetadata 와 page 가 각자 생성해도 같은 결과
  → 캐시가 있든 없든 같은 결과
  → 폴백을 되살려도 안전
```

**시드를 고정하면 "각자 독립적으로 생성"이 더 이상 문제가 아닙니다.**

### 그 위에 정적 생성을 얹으세요

```
generateStaticParams()  로  ENABLED_COURSE_PAGES 24개를 빌드 타임에 생성
revalidate = 86400      로  하루 한 번 갱신
```

**빌드 산출물로 존재하면 크론이 실패해도 페이지는 살아 있습니다.**
크론은 "갱신"용이지 "존재"의 조건이 되면 안 됩니다.

---

## 5. ★★ 지금 당장 — sitemap에서 코스 URL을 빼주세요

고치는 동안에도 구글은 계속 옵니다.

```
sitemap 에서 /course/* 24개 제거
  →  고쳐서 200 을 확인한 뒤 다시 넣기
```

**404 24개를 계속 제출하는 것보다 잠시 빼는 게 낫습니다.**

---

## 6. ★★ 테스트가 이걸 또 놓쳤습니다

```
vitest 414개 통과 (신규 회귀 테스트 7건 포함)  ·  next build 통과  ·  CI green
                                    ↓
                        프로덕션 24개 전부 404
```

신규 테스트가 `generateMetadata` 와 본문의 **일치**는 봤지만,
**캐시가 빈 상태에서 페이지가 200을 주는지**는 안 봤습니다.

```
추가할 것
  · 캐시 비운 상태에서 /course/경주/2박3일 → 200
  · 캐시 있는 상태에서 → 200, 내용 동일
  · 같은 입력 2회 생성 → 결과 동일 (시드 고정 검증)
```

---

## 7. 요청하신 좌표 필드명 — `lat` / `lng` 입니다

AutoPipeline 세션이 확인을 요청한 건입니다. 스팟 객체 원본을 그대로 옮깁니다.

```json
{
  "day": 1,
  "lat": 35.8374081139238,
  "lng": 129.209953809161,
  "name": "경주 황리단길",
  "order": 1,
  "rating": 4.2,
  "category": "관광지",
  "toNextMode": "walk",
  "reviewCount": 7771,
  "toNextMinutes": 3
}
```

```
평탄한 lat / lng 입니다.  latitude / coordinate.lat 같은 중첩은 없습니다.
dayTotals[i] = { day, spotCount, distanceKm }
```

---

## 8. ★ 잘 된 것

```
/trip/3 · /trip/4 · /trip/6  →  robots = noindex, nofollow   ✅
/trip/5 (전체공개)            →  robots 없음                  ✅
sitemap 24개 (지역,일수) 쌍 구조로 전환                        ✅
서울·부산·제주·인천을 실측된 1박2일로만 켠 판단                ✅
```

**§5 noindex 는 정확히 됐습니다.** 공개/비공개 구분도 맞습니다.

---

## 9. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | sitemap 에서 코스 URL 임시 제거 (§5) | 소 · **즉시** |
| 2 | 난수 시드 고정 (§4) | 중 |
| 3 | 라이브 생성 폴백 복구 (§4) | 소 |
| 4 | generateStaticParams + revalidate (§4) | 중 |
| 5 | 빈 캐시 상태 200 테스트 (§6) | 소 |
| 6 | 200 확인 후 sitemap 재등록 | 소 |

---

## 10. 배포 후 Cowork이 확인할 것

| 항목 | 기대 |
|---|---|
| 코스 URL 24개 | **전수** HTTP 200 |
| 캐시 무효화 직후 | 여전히 200 |
| 같은 URL 2회 | 내용 동일 |
| HTML | 장소명·평점 포함, JS 꺼도 보임 |
| sitemap | 200 확인된 것만 등록 |

---

## 11. 처리 결과 (이 세션이 추가)

### §3/§4 원인 재조사 — 이전 라운드의 진단을 정정한다

이전 라운드(`docs/work-orders/2026-09-22_course-pages-404.md` §8)는 원인을
`courseRecommend.ts`의 `pickDeterministic`(`pool[Math.floor(Math.random()*
pool.length)]`)이라고 지목했다. **이건 틀렸다** — 코드 확인 결과
`pickDeterministic`은 `/api/course/recommend`·`/api/course/recommend/reroll`
(v1 인터랙티브 리롤 플로우)에서만 호출되고, `courseBrief.ts`의
`generateDay`→`generateCourseV2`(v2, course-brief가 실제로 쓰는 경로)는
이 함수를 아예 부르지 않는다.

실제 경로를 다시 추적해 진짜 원인을 찾았다: `generateCourseV2`의 1일차
취향 큐레이션(`curateTaste`)이 Anthropic LLM(`callHaiku`)을 호출하는데,
`temperature`를 지정하지 않아(요청 본문에 없음 — API 기본값 사용) 완전히
같은 프롬프트를 넣어도 매번 다른 상위 후보가 나올 수 있다(2·3일차는 이미
`skipLlm: true`라 이 문제가 없다). 이게 §2 원본 지시서가 관찰한
"메타데이터는 성공, 본문만 notFound()" 모순의 실제 원인으로 보인다.

### §4 — "시드 고정" 대신 "동시 생성 합치기"를 선택했다

지시서는 `${region}:${days}:${COURSE_ALGO_VERSION}` 시드로 난수를 고정하라고
했지만, 실제 비결정성의 근원이 PRNG가 아니라 **LLM 응답**이라 같은 방식으로
시드를 고정할 수 없다(Anthropic API엔 재현을 보장하는 seed 파라미터가
없고, temperature=0으로도 완전한 bit-for-bit 재현은 보장되지 않는다).
LLM 큐레이션 자체를 끄거나 바꾸는 건 코스 품질에 영향을 주는 별도
결정이라 이번 지시서 범위를 넘는다고 판단해 손대지 않았다.

대신 `courseBrief.ts`에 `dedupeInFlight`(모듈 스코프 `Map<string,
Promise<CourseBrief>>`)를 추가해 **같은 (지역,일수)의 라이브 생성이 동시에
정확히 한 번만 돌게** 만들었다 — generateMetadata와 페이지 본문이 (React
`cache()`로는 안 됐지만) 이 모듈 스코프 Map은 같은 Node 프로세스 안에서
항상 공유되므로, 비결정적인 LLM 호출이 결과에 드러날 기회 자체가 없어진다.
효과는 지시서가 원한 것과 동일하다 — "같은 입력엔 항상 같은 결과".

### §4 — 라이브 생성 폴백을 복구했다

`getCachedCourseBrief`(캐시 미스 시 곧장 null)를 삭제하고 `getCourseBrief`
(캐시 미스 시 `buildBrief`로 라이브 생성, 이제 `dedupeInFlight`로 보호됨)로
되돌렸다 — 페이지 존재가 크론 성공 여부에 묶이지 않는다.

### §4 — generateStaticParams + revalidate는 이번엔 넣지 않았다

`generateStaticParams`는 `dynamic = "force-dynamic"`과 상충한다(정적
프리렌더를 요청하는 것과 매 요청 동적 렌더를 강제하는 것은 같이 못 쓴다) —
제대로 하려면 `force-dynamic`을 떼고 ISR(`revalidate`) 모델로 라우트
전체를 바꿔야 하는데, `next build` 시점에 24개 지역의 라이브 생성(외부
API 호출 포함)이 전부 성공해야 빌드가 끝난다는 새 리스크가 생긴다(이
세션엔 DB/외부 API 접근이 없어 빌드 타임 검증도 못 한다). `dedupeInFlight`
+ 라이브 폴백 복구만으로 "페이지 존재가 크론에 안 묶인다"는 §3의 핵심
요구는 이미 충족되므로, 이번 라운드에선 범위를 좁혀 여기까지만 했다 —
필요하면 별도 지시서로 다뤄달라.

### §5 — sitemap에서 코스 URL 24개를 뺐다

`src/app/sitemap.ts`에 `COURSE_PAGES_IN_SITEMAP = false` 플래그를 추가해
코스 페이지 URL을 sitemap에서 뺐다 — 두 라운드 연속으로 프로덕션에서
24개 전부 404가 난 전례가 있어, 이번 수정이 실제로 200을 내는지 Cowork가
확인하기 전까지는 재등록하지 않는다. `true`로 바꾸면 즉시 재등록된다.

### §6 — 테스트 추가

- `courseBrief.test.ts`: `dedupeInFlight`가 (a) 동시 호출을 하나의 run()으로
  합치고, (b) 다른 key는 독립적으로 돌고, (c) 끝나면 key를 지워 다음 호출이
  다시 돌 수 있고, (d) 실패해도 key가 안 걸려있는지 검증한다.
- `page.test.ts`: `getCourseBrief`를 모킹해 generateMetadata/페이지 본문이
  일치하는지 계속 검증한다(이전 라운드 테스트 유지, `getCachedCourseBrief`
  참조만 `getCourseBrief`로 갱신).

**한계**: 이 샌드박스엔 DB/외부 API 접근이 없어 "캐시 비운 상태에서 실제
`/course/경주/2박3일`가 진짜 200을 주는지"는 여전히 직접 실측하지 못했다 —
`dedupeInFlight` 단위 테스트로 메커니즘은 검증했지만, 프로덕션 확인은
Cowork 몫이다.
