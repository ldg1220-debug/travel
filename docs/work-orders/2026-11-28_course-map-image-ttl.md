# [Cowork 지시서] 코스 지도 최적화 이미지 캐시가 60초뿐 — 식은 캐시에서 LCP 4.5초 · images.minimumCacheTTL 늘리기

(이슈 #459 본문 요약 저장)

## 0-1. 근거 (2026-11-28 10~11시 KST 실측)
- Pixel 5 · 느린 4G · CPU 4배: 첫 측정(캐시 식음) 도쿄 LCP 4.49초·제주 3.74초·다낭 2.98초 → 캐시 데워지면 도쿄 2.34~2.49초·제주 1.58~1.63초.
- `/_next/image?url=/api/content/course-map?...&w=828&q=60` 응답 `cache-control: public, max-age=60`. 원본은 `s-maxage=2592000` + ETag, URL 에 내용 해시 `v=` 포함.

## 1. 할 것
1. `next.config.ts` images 에 `minimumCacheTTL`(권장 2592000) 추가. 문서에서 의미·기본값·원본 s-maxage 미준수 이유 확인 후 PR 본문에 한 줄.
2. `localPatterns`·`formats`·`qualities`·`sizes`·지도 URL(`v=`) 유지.
3. 다른 `next/image` 사용처 영향은 PR 본문에 ★.
4. 설정값 확인 테스트 1개.

## 2. 확인할 것
- tsc · eslint · vitest · next build 통과.
- 배포 후 `curl -sI -H 'Accept: image/avif' "https://www.tradule.co.kr/_next/image?url=%2Fapi%2Fcontent%2Fcourse-map%3Fregion%3D%25EB%258F%2584%25EC%25BF%2584%26days%3D3%26v%3D6b5b1f0dda&w=828&q=60"` → max-age > 60(목표 2592000), `content-type: image/avif`.
- 2분 넘게 간격 두고 재요청해도 `x-vercel-cache: HIT`.
- 도쿄·제주 LCP 가 데워진 값(2.3초·1.6초) 근처 유지.
- 원본 course-map 은 1200×630 PNG · `s-maxage=2592000` 유지.
- `/api/health` ok=true · 경고 0 · courseBuild.currentVersion 52 · maps `static` 사용량 안 튐.

## 3. 하지 말 것
- COURSE_ALGO_VERSION 올리기, 특정 호텔 추천, Static Maps 호출 증가·새 유료 서비스, 원본 응답·블로그 URL 변경, 코스 내용·문구·디자인 변경, 비밀값·환경변수·claude.yml 수정 금지.
