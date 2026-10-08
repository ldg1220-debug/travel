# 작업 지시서 — #301 검증: Drive 는 의도대로 들어갔습니다. 플래너로 가는 링크만 "전체 새로고침" 으로

작성: 2026-10-08 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `82d2e7f`(#301) 라이브 SSR HTML 실측 (Cowork 은 /planner/{토큰} 페이지를 열지 않음 — 9월 덮어쓰기 사고 이후 원칙)

---

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-08_pr301-planner-hard-nav.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

---

## 1. ★★★ 된 것

```
Drive 로더   / · /discover · /course · /course/오사카/2박3일  → 인라인 로더 1개 (+ RSC 페이로드 사본 1, 실행 아님)   ✅
             /trip/7 · /planner  → 0                                                                         ✅
사이트맵     코스 URL 4 → 16                                                                                 ✅ (버전 무관 기록 동작)
```

## 2. ★★★ 홈 → 플래너 SPA 이동 시 Drive 가 남는 문제 (보고서가 짚은 부작용)

라이브 확인은 하지 않았습니다(토큰 페이지를 Cowork 이 여는 것 자체를 피함). 대신 구조로 막습니다.

```
Drive 가 로드되는 페이지(/ · /discover · /course/**)에서
  /planner/** · /trip/** · course-open 결과로 가는 모든 이동은 "전체 문서 이동" 으로
  - <Link> 대신 <a href> (또는 Link 에 reloadDocument 상당) / router.push 대신 window.location.assign
  → JS 컨텍스트가 초기화되어 Drive 가 플래너 페이지에 따라 들어가지 않음
가드 테스트: Drive 로드 페이지 컴포넌트에서 /planner · /trip 으로 가는 next/link 사용을 금지(정적 검사)
```

반대 방향(플래너 → 홈)은 문제 없음(토큰 없는 페이지에서 Drive 가 새로 로드).

## 3. 크론 실측

배포 후 첫 `warm-course-brief` 실행의 `processed · skippedByDeadline · elapsedMs` 는 Cowork 이 Vercel 로그에서 직접 확인합니다(추가 작업 없음).

## 4. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | §2 플래너/트립 링크 전체 이동 · 가드 테스트 | 소 · **최우선** |

---

## 처리 결과

### §2 — 완료 (Drive 로드 문서에서 토큰 민감 목적지는 전체 문서 이동)
- **방식이 지시서와 다르다**: 지시서는 "`<Link>` 대신 `<a href>` / `router.push` 대신 `window.location.assign`"으로 일괄 교체하라고 했다. 대신 **런타임 판별 헬퍼**(`src/lib/documentNavigation.ts`)를 썼다 — Drive 스니펫이 붙이는 `<script id="tp-drive">`가 문서에 있고 목적지가 토큰 민감 주소(`/planner`·`/planner/**`·`/trip/**`·`/api/content/course-open`)일 때만 전체 문서 이동(`window.location.assign`)으로 바꾼다. 이유: `AppBar`·`BottomTabBar`·`NotificationBell`은 전역 내비게이션이라 Drive가 없는 페이지(/community, /scrapbook 등)에서도 쓰이는데, 일괄 `<a>`로 바꾸면 그 모든 곳의 플래너 이동이 불필요하게 전체 새로고침이 된다. Drive가 로드된 문서에서는 지시서와 같은 결과(JS 컨텍스트 초기화)다.
- 적용: `pushSafely(router, href)`(router.push 대체) — `HomeClient`·`DiscoverClient`·`CourseClient`(/planner 이동 전부), `AppBar`(새 계획·초안·미리보기 → /planner), `NotificationBell`(→ /trip/{id}). `navigateByDocumentIfNeeded(event, href)`(`<Link>` onClick) — 홈의 `/planner`·`/trip/{id}` 링크, `AppBar` 데스크톱 탭, `BottomTabBar`(탭이 `/planner`일 때). 코스 상세(서버 컴포넌트)의 후기 링크 `/trip/{id}`는 `<a href>`로 바꿨다(항상 Drive가 로드되는 페이지). 새 탭 클릭(Ctrl/Cmd/Shift/중클릭)·이미 막힌 이벤트는 건드리지 않는다.
- **안전성 확인**: 이 이동들은 `router.push` 직전에 zustand 스토어(`useItineraryStore`)를 바꾸는데, 스토어는 `persist`(localStorage)라 `set`이 동기적으로 저장한다 — 전체 문서 이동으로 메모리 상태가 사라져도 플래너 페이지가 localStorage에서 다시 읽는다. 라이브로 확인하지는 못했다.
- **가드 테스트(정적 검사)**: Drive 로드 페이지와 전역 내비게이션 7개 파일에서 (1) `router.push("/planner…"|"/trip/…")` 직접 호출이 없고 (2) `/planner`·`/trip`·`tab.href`로 가는 `<Link>`는 모두 `navigateByDocumentIfNeeded`를 쓴다 — 가드가 실제로 대상 링크를 잡는지(홈 2·AppBar 1·BottomTabBar 1) 개수도 단언한다. 지시서의 "next/link 사용 금지"보다 한 단계 약하다(링크는 허용하되 헬퍼를 반드시 거치게).
- **한계**: 이 헬퍼가 막는 건 "Drive가 로드된 문서에서의 SPA 이동"이다. `PlannerBoard`가 저장 뒤 `history.replaceState`로 `/planner/{토큰}`으로 URL을 바꾸는 경우(Drive가 같은 문서에 이미 있다면)나 Drive가 홈 이외에서 조건부로 주입되는 `/planner`(제휴 링크가 보일 때)의 `location=`는 이 변경으로 바뀌지 않는다. 반대 방향(플래너 → 홈)은 지시서 말대로 문제없다.

### §3 — 추가 작업 없음 (Cowork이 Vercel 로그에서 확인)

### `COURSE_ALGO_VERSION` — 변경 없음

### 검증 관련 메모
프로덕션 접근 불가. 홈에서 플래너·후기로 이동할 때 전체 문서 이동이 일어나는지·Drive가 따라가지 않는지는 라이브로 확인하지 못했다.
