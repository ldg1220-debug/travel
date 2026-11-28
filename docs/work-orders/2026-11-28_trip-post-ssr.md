# 작업 지시서 — 공개 후기 페이지(/trip/{id}) 서버 본문 렌더 + canonical

작성: 2026-11-28 16시 · Cowork · 이슈 #461

sitemap 에 올린 공개 후기(/trip/2·5·7)가 HTML 에 본문 없이 "불러오는 중…"뿐이어서 검색엔진에는 내용 없는 페이지로 보임.

## 할 것
1. `src/app/(app)/trip/[id]/page.tsx`: 공개(visibility='public') 글일 때만 서버에서 제목·본문·여행지/일정 요약·대표 사진 1장 렌더. 비공개·친구공개는 FALLBACK noindex 유지. 새 유료 API 호출 금지.
2. 공개 글 `alternates.canonical = https://www.tradule.co.kr/trip/{id}`.
3. (선택) `Article` JSON-LD — headline·datePublished/dateModified·image. 근거 없는 평점·수치 금지.
4. `src/app/sitemap.ts` 고정 페이지 lastModified 가 매 요청 now → privacy·terms 는 고정 날짜, 나머지는 생략/고정.
5. 테스트: 공개 글 → 본문·canonical / 비공개 글 → 본문 없음 + noindex.

## 확인할 것 (병합 후 운영)
- `curl -s https://www.tradule.co.kr/trip/5 | sed 's/<[^>]*>/ /g' | tr -s ' ' | wc -c` → 수백 자 이상, 후기 첫 문장 보임
- `curl -s https://www.tradule.co.kr/trip/5 | grep -o '<link[^>]*canonical[^>]*>'` → `https://www.tradule.co.kr/trip/5`
- `/trip/3`(비공개) → 본문 없음, robots noindex 유지
- sitemap.xml 의 /privacy·/terms lastmod 가 요청마다 바뀌지 않음
- 브라우저 /trip/5 화면 동일(중복 표시 없음), 콘솔 hydration 오류 없음

## 하지 말 것
COURSE_ALGO_VERSION 올리기 · 특정 호텔 추천 · 비공개/친구공개 글 내용 서버 노출 · 사용자 데이터/DB 스키마 변경 · 비밀값/환경변수/claude.yml 변경 · 큰 디자인 변경
