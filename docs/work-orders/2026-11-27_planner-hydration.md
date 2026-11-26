# [Cowork 지시서] 코스 → 계획 화면 — 공유 계획 페이지 React 오류 #418, "일정" 제목 줄바꿈

- 대상: `/planner/[shareToken]` (예: `/planner/1d95af95-ab60-4fcc-acfa-6b82a90a3168`), 393px · ko-KR · Asia/Seoul
- 증상: `Minified React error #418 (text)` 하이드레이션 불일치. 일정 탭 머리줄에서 제목 "일정"이 한 글자씩 줄바꿈.
- 할 것: (1) 첫 렌더 서버/브라우저 글자 불일치 원인 제거(날짜·`toLocale*`·`Date.now()`·localStorage 의존 글자는 마운트 이후 표시). (2) 머리줄 393/360px에서 제목 nowrap·shrink-0, 넘치는 버튼은 다음 줄로(기능·순서·44px 터치영역 유지). (3) 회귀 방지 단위 테스트.
- 확인: 모바일 page error 0, 제목 한 줄, 담아가기 → "언제 떠나세요?" 시트 흐름 유지, `/api/health` ok.
- 하지 말 것: `COURSE_ALGO_VERSION` 변경, 특정 호텔 추천, 저장된 계획 데이터·비밀값·`claude.yml` 변경, 큰 디자인 개편.
