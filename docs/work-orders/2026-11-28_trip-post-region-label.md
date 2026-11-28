# 작업 지시서 — 공개 후기(/trip/2·5·7) 지역 코드 노출 → 한글 표기 + 코스 페이지 링크

작성: 2026-11-28 · Cowork · 이슈 #463

## 근거
- `/trip/5` 보이는 글자에 `international`, `/trip/7` 에 `domestic` 코드값이 그대로 노출. 원인: `TripPostSsrSummary.tsx` 의 `meta = [post.region, post.tripTitle]`.
- 서버 본문에서 `/course/...` 코스 페이지로 가는 링크 없음.

## 할 것
1. 지역 코드: `domestic`→`국내`, `international`/`overseas`→`해외`, 그 외→표시 안 함 (`src/lib/tripPostSeo.ts` 순수 함수).
2. `tripTitle` 에 색인 코스 여행지(INDEXED_COURSES 12곳)가 있으면 서버 본문 하단에 `{지역} 추천 코스 보기 →` 링크 1개. 없으면 없음.
3. 테스트: 라벨, 여행지 매칭(후쿠오카 → 링크, 동래 → 없음).

## 확인할 것 (병합 후)
- `/trip/5` international 0건·`해외` 표시, `/trip/7` domestic 없음·`국내` 표시
- `/trip/5` 후쿠오카, `/trip/2` 오사카 코스 링크 1개
- `/trip/3` 비공개 → 본문 없음 + noindex
- 클라이언트 화면 변경 없음

## 하지 말 것
COURSE_ALGO_VERSION · 호텔 추천 · 비공개 글 노출 · DB/스키마 · 유료 API · 비밀값/claude.yml · 큰 디자인 변경
