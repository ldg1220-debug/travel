# 작업 지시서 — #304 검증: 오사카 57.8→22.9km. 서울은 아직 왕복 · 종류 값이 "기타" 투성이

작성: 2026-10-12 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `13ca926`(#304) v34 라이브 실측 10:00 KST

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-12_pr304-category-seoul-order.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 1. ★★★ 된 것

```
오사카 d3  57.8 → 22.9km · 2일차 도톤보리→규카츠→구로몬→메이드리밍→난바 야사카 신사 전부 도보 · 쓰텐카쿠·아베노하루카스 같은 날 연속 ✅
도쿄 d3    카미나리몬 중복 제거 · 2일차 시바 공원→도쿄 타워→시부야 스카이→몬자→메이지 신궁 ✅
세부 · KK  선착장 → 배 → 섬 유지 ✅
```

## 2. ★★ 서울은 아직 왕복

```
서울 d3 · 2일차 (37.7km)
  창덕궁 →차 45→ 북한산둘레길 →차 47→ 결(카페) →차 6→ 경복궁 →차 32→ 고기굽는저녁
```

창덕궁 · 경복궁이 붙어 있지 않고 북한산을 중간에 다녀옵니다. 보고서가 짚은 **"평점 보강 단계의 1번 자리 맞바꿈"(국내 위주)** 이 최적화 뒤 순서를 다시 흐트러뜨리는 것으로 보입니다.

```
평점 보강 맞바꿈은 optimizeDayOrder 이전으로 옮기거나, 맞바꿈 후 optimizeDayOrder 재실행
로그 path=day-order 가 서울 d3 2일차에 찍히는지 확인
```

## 3. ★★ 종류(category) 값 — AutoPipeline 표에 "—"/"장소" 로 나옴

```
세부   산토니뇨 성당[기타] · Sage/골드문/Cheeva Spa[기타] · 수바-배즈바스 퍼블릭 비치[기타] · 힐튼 선착장[기타] · Crocolandia[테마파크]
도쿄   도쿄 스카이트리 · 센소지 · 신주쿠 교엔 · 도쿄 타워 · 메이지 신궁 · Godaime Wagyu[기타]
오사카 해유관[테마파크] · 오사카 성[기타] · 쓰텐카쿠[기타]
```

Google `types`/`primaryType` → 한국어 종류 매핑 표를 보강하세요(해외).

```
spa · massage · beauty_salon(마사지) → 스파
church · hindu_temple · buddhist_temple · shrine · place_of_worship → 사원·성당
beach → 해변 · ferry_terminal · pier · 선착장 이름 → 선착장 · island → 섬
aquarium → 수족관 · zoo → 동물원 (테마파크 X — #297 종일시설 판정과 일치)
observation_deck · tower · 전망대/타워/스카이 이름 → 전망대
park · national_park · garden → 공원 · castle · historical_landmark · museum → 명소/유적
restaurant 계열(*_restaurant · food) → 음식점
그 외 tourist_attraction → 관광지 · 진짜 없을 때만 기타
```

## 4. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | §2 서울 순서 | 소 |
| 2 | §3 종류 매핑 | 소 |
| 3 | `COURSE_ALGO_VERSION` 34 → 35 | 극소 |

## 5. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| 서울 d3 | 창덕궁 · 경복궁 연속 · 북한산은 그날 끝 또는 다른 날 |
| 세부 · 도쿄 · 오사카 | "기타" 대부분 사라짐 · 해유관 수족관 · Crocolandia 동물원 |
| 오사카 · 도쿄 · KK · 세부 | 회귀 없음 |

---

## 처리 결과

### §2 — 완료 (평점 보강 맞바꿈이 동선을 다시 흐트러뜨리지 않게) — 원인은 로그 없이 코드 정황으로 추정
지시서의 의심과 같다: 라우팅 뒤 평점 보강 단계(`findRatedFirstStopSwapIndex`)가 평점 없는 1번 스팟을 평점 있는 j번과 **내용째 맞바꾼다**. 서울(국내 — 평점이 늦게 붙는다)에서 [북한산 → 창덕궁 → 결 → 경복궁 → …]처럼 최적화된 순서의 1·2번을 맞바꾸면 창덕궁 → 북한산 → 결 → 경복궁이 된다(관측과 일치). 단, **`path=day-order` 로그가 서울 d3 2일차에 찍혔는지는 확인하지 못했다**(로그 미전달) — 맞바꿈이 원인이라는 것도 정황 추정이다.
- 수정: 맞바꾼 경로가 현재보다 **10%(+0.3km)를 넘게 길어지면 맞바꾸지 않는다**(`ratedFirstSwapKm`, `optimizeDayOrder`의 평점 선호와 같은 허용치). 건너뛰면 로그 `path=rated-first-swap-skipped … km a→b`. 결과: 첫 스팟이 평점 없이 남을 수 있다 — 동선이 왕복하는 것보다 낫다는 판단이다.
- **지시서와 다르게 한 것**: 지시서의 두 안("맞바꿈을 optimizeDayOrder 이전으로" / "맞바꿈 후 optimizeDayOrder 재실행")을 택하지 않았다. 맞바꿈은 라우팅·평점 보강 *이후* 단계라 이전으로 옮기면 평점을 모른다 — 재실행은 스팟 객체(CourseBriefSpot)에서 제약(숙소·시설·배 묶음)을 다시 판정하고 전 구간을 재라우팅해야 해서 범위가 컸다. 허용치 가드가 최소 변경으로 같은 증상을 막는다.

### §3 — 완료 (코스 스팟 종류 매핑)
- 코스 응답 전용 `courseSpotCategory`(`src/lib/server/courseSpotCategory.ts`)를 만들어 `assembleDaySpots`의 `category`에 쓴다. discover가 쓰는 `liveCategoryBucket`은 그대로 둔다(다른 화면 영향 방지).
- 우선순위: ① Google `primaryType` 정확 일치(표) → ② 식음료·숙소는 기존 버킷(음식점·카페·술집·숙소) → ③ "관광지"·"기타"로 떨어질 때만 이름 단서(선착장 > 섬 > 해변 > 스파 > 전망대 > 사원·성당 > 공원 > 명소/유적 > 음식점) → ④ `tourist_attraction`류는 "관광지", 정말 없을 때만 "기타".
- 새 값: **스파**(spa·massage·beauty_salon·이름) · **사원·성당**(church·hindu_temple·buddhist_temple·shinto_shrine·place_of_worship 등) · **해변** · **선착장**(ferry_terminal·pier·marina·선착장 이름) · **섬** · **수족관** · **동물원**(테마파크 X — #297 종일시설 판정과 일치) · **전망대**(observation_deck·타워/스카이/전망대 이름, 쓰텐카쿠) · **공원**(park·national_park·garden·교엔) · **명소/유적**(castle·historical_landmark·museum·성/궁). 테마파크는 amusement_park·water_park·theme_park뿐. 응답 계약 영향: `spots[].category`가 취할 수 있는 값이 늘었다(AutoPipeline이 기존 7개 값만 가정했다면 새 값 처리가 필요하다).
- **지시서와 다르게 한 것**:
  - 지시서의 "그 외 tourist_attraction → 관광지"보다 **이름 단서를 먼저** 본다 — `tourist_attraction`인 "도쿄 타워"·"센소지"를 전망대·사원으로 세분하기 위해서다. 이름 단서가 없을 때만 "관광지".
  - **이름만으로 판정하는 약한 규칙**(한글 2자 이상 + 사/지로 끝남 → 사원 — "센소지"·"불국사", 이름에 와규·스시·라멘·식당 등이 있으면 음식점)은 **타입이 "기타"일 때만** 쓴다. 오탐 가능성이 있다(예: 사/지로 끝나는 비사원 지명).
  - 실제 응답의 primaryType을 못 봐서(관측값 표만 받았다) 도쿄의 "기타" 스팟들이 어떤 타입이었는지는 모른다 — 타입 표와 이름 단서를 함께 둔 이유다. 라이브에서 "기타"가 남으면 그 스팟의 raw category를 알려주면 표를 보강한다.
  - `NON_BEACH_VENUE_CATEGORY`에 `스파|선착장`을 더했다 — 새 한글 종류 값이 "기타" 대신 붙어 해변 판정 이름 단서(예: "Beach Spa")가 해변으로 오판되는 것을 막는다. 대표 명소 후보 제외 목록(코스 페이지 title)에도 스파·선착장을 더했다.

### `COURSE_ALGO_VERSION` — 완료 (34→35)

### 검증 관련 메모
프로덕션 접근 불가. 서울 d3 순서·세부/도쿄/오사카의 "기타" 감소는 라이브로 확인하지 못했다. 단위 테스트: 지시서 매핑 표 전부(타입·이름), 식당·숙소 우선, 수족관·동물원, beach 플래그 우선, 맞바꿈 허용치(북한산 왕복 사례).
