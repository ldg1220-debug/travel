# 지시서 — 코스 페이지별 사람 방문을 /api/health 에 노출 (2026-11-14, autopilot)

근거: DIRECTION.md 목표 "사람 방문 늘리기". 현재 사람 방문 합계(14/일)만 있어 12개 색인 코스 중 어디가 보이는지 알 수 없음 → 계측.

- §1 코스 페이지 렌더 시 사람 방문이면 `course-page:{PT날짜}:{지역/일수}` 카운터 +1 (place_candidate_cache, 기존 UA 카운터와 같은 방식 · 추가 외부 비용 없음)
- §2 health `courseBuild.topCoursePagesToday` (상위 10)
- §3 이틀 지난 카운터는 기존 워밍 크론의 purge 에서 함께 삭제
- 코스 생성 로직 변경 없음 (COURSE_ALGO_VERSION 불변)
