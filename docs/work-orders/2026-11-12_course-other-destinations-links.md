# 코스 페이지 내부 링크 보강 (2026-11-12)

## 근거
색인 코스 12개는 지역당 1개뿐이라 sameRegion 은 항상 비고, 같은 나라 링크는 일본(오사카·도쿄·후쿠오카)만 생긴다.
세부·방콕·제주 등 단독 지역 페이지는 관련 링크가 0개 → 크롤러가 허브(/course)로만 이어진다.

## 작업
- §1 pickRelatedCourseLinks 에 otherDestinations(다른 나라·광역, 지역당 1개, 최대 4개) 추가. 확인된 조합만 링크(404 방지).
- §2 코스 페이지 "관련 코스" nav 에 "다른 여행지 코스" 렌더.
- §3 테스트 추가, DIRECTION.md 백로그 체크.

## 비용
DB 조회·API 호출 추가 없음(기존 fetchConfirmedCoursePages 결과 재사용). 코스 생성 로직 불변 → COURSE_ALGO_VERSION 변경 없음.
