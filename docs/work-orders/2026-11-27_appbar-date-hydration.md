# [Cowork 지시서] 공유 계획 페이지 React #418 남음 — 상단바(AppBar) 날짜 글자 서버/브라우저 불일치

- 대상: `/planner/1d95af95-ab60-4fcc-acfa-6b82a90a3168` (393px·ko-KR·Asia/Seoul)
- 근거: PR #428 배포 후에도 page error `Minified React error #418 (args: text)` 1건. 서버 HTML 에만 있는 글자 = "11월 26일 목요일", "새 여행" (서버 UTC "오늘" vs 브라우저 KST "오늘"). 출처 추정: `src/components/AppBar.tsx` 의 `planHeaderDateLabel(activeDate, items, viewerContentPlan)` — `activeDate` 초기값 `todayISODate()`.

## 할 것
1. 상단바 날짜 글자(및 "새 여행"/계획 이름)가 서버 렌더·하이드레이션 첫 렌더에서 브라우저와 같게. `useIsClient()` 로 마운트 전에는 같은 높이의 빈 자리만. `todayISODate()` 시간대 동작은 바꾸지 않는다.
2. 공유 계획 페이지에서 다른 날짜/localStorage 기반 글자가 서버 HTML 에 더 있는지 확인, 같은 방식으로 정리.
3. 회귀 방지 단위 테스트(renderToString 에서 날짜 글자를 내지 않음).

## 확인할 것
- 운영 `/planner/1d95af95-...` 393px·ko-KR·Asia/Seoul 에서 page error 0. 가능하면 KST 00~09시.
- 상단바 계획 날짜·이름이 마운트 후 정상 표시, "일정" 제목 한 줄 유지.
- "내 계획으로 담아가기" → "언제 떠나세요?" 시트 → 담기 흐름 그대로. `/api/health` ok=true.

## 하지 말 것
- COURSE_ALGO_VERSION 올리기, 특정 호텔 추천, 저장된 사용자 계획 데이터 변경, 비밀값·환경변수, `.github/workflows/claude.yml` 수정, `todayISODate()` 시간대 기준 변경, 디자인 개편.
