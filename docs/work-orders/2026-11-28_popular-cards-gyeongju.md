# [Cowork 지시서] 홈·/discover "인기 여행 코스"에 경주(2박3일)만 빠짐 — 대표 1순위 일수 아니면 카드 제외되는 규칙 보완

(이슈 #467) `pickPopularCourses` 지역 대표 카드를 `regionTypicalDays(region)` 앞쪽부터 처음 확인된 페이지로 선택. 대표 일수 밖 일수는 제외 유지. 나머지 규칙(나라당 3·국내 2·휴양지 2·라운드로빈·limit 12) 그대로. 테스트: 경주 3일만 / 1순위+3순위 → 1순위 / 목록 밖 제외.

하지 말 것: COURSE_ALGO_VERSION · indexedCourses.json · regionTypicalDays 데이터 · 유료 API · 워밍 · 비밀값/workflows · 카드 디자인.

병합 후 확인: 홈·/discover 코스 링크 12개(+/course/all)에 `/course/경주/2박3일` 포함, `/api/health` ok · warnings 빈 배열.
