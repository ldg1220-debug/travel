# [Cowork 지시서] 코스 페이지 첫 화면 지도(LCP) 194KB PNG를 휴대폰에서 359px로 줄여 보여줌 (#437)

- 근거(2026-11-27 11시 KST, Pixel 5·느린 4G·CPU 4배): LCP 도쿄 4.28초 · 제주 3.34초 · 다낭 3.19초(좋음 기준 2.5초). LCP 요소는 `/api/content/course-map` PNG(194,219B, 1200×630)이 359×188 로 표시됨. srcset/sizes 없음.
- 할 것:
  1. 코스 페이지 첫 지도를 `next/image`(sizes `(max-width: 672px) 100vw, 672px`, priority)로. `images.localPatterns` 로 쿼리 붙은 경로 허용. Static Maps 호출 늘리지 않기.
  2. 원본 1200×630 PNG·URL·형식·캐시 헤더 불변(블로그·OG·course-brief).
  3. LCP 이미지 `decoding="async"` 제거, 1200:630 비율 유지(CLS 없음).
  4. route.ts 크기 주석을 실제(1200×630)로.
  5. 테스트: 지도 이미지 srcset·sizes·alt.
- 확인: tsc·eslint·vitest·next build. 배포 후 Pixel 5 에서 지도 요청 100KB 이하, 도쿄·제주·다낭 LCP 감소, `/api/health` ok=true·경고 0·maps static 사용량 평소 수준, 원본은 여전히 1200×630 PNG.
- 하지 말 것: COURSE_ALGO_VERSION, 특정 호텔 추천, Static Maps 호출 증가·유료 서비스, 코스 내용·디자인, course-map 원본 응답·블로그 URL, 비밀값·claude.yml.
