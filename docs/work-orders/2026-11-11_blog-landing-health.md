# 작업 지시서 — 블로그 유입(utm_source=maeilg) 랜딩 수 health 노출 (DIRECTION.md 백로그 5번)

작성: 2026-11-11 · Autopilot

- 코스 페이지(`/course/{지역}/{일수}`)에 `?utm_source=maeilg` 로 들어온 **사람** 방문(classifyVisit=human)을 일 카운터(blogLanding)로 센다.
- /api/health `courseBuild.blogLandingToday` 로 노출. 사람 방문(human)의 일부이며 봇·직접 호출은 세지 않는다.
- 카운터 쓰기 실패는 삼킨다. 코스 생성·Places 호출·유료 사용 변화 없음. 저장 정보는 하루 합계뿐(개인 식별자 없음).
- 한계: 페이지 프리페치·새로고침은 중복 집계될 수 있음(근사치).
