# [Cowork 지시서] 코스 지도 AVIF·품질 조정 (2026-11-27, 이슈 #439)

휴대폰(Pixel 5, 배율 2.75)은 `/_next/image` 에서 w=1200 WebP q=75 를 받아 도쿄 지도가 146,832B → LCP 3.4초. 목표: 100KB 이하.

## 할 것
1. `node_modules/next/dist/docs/` Image 문서(`formats`, `qualities`, `deviceSizes`) 읽기.
2. `next.config.ts` `images` 에 `formats: ["image/avif","image/webp"]`, `qualities` 에 지도용 낮은 품질(예: 60) 허용, 코스 페이지 첫 지도 `<Image>` 에만 `quality` 지정. 다른 이미지 동작 불변.
3. 로컬 `next build && next start` 에서 도쿄 지도를 w=1080·1200 AVIF/WebP 로 받아 바이트 표를 PR 본문에. 도쿄 w=1200 ≤100KB 조합 선택. 글자 가독성 확인.
4. 100KB 초과 시 ★ 로 이유·다음 방안(sizes 조정 등). 화면 크기·비율·위치 불변.
5. 최적화기가 `/api/content/course-map` 을 가져올 때 Static Maps 호출이 늘지 않는지 코드로 확인, PR 에 한 줄.
6. 테스트: 지도 `<Image>` 의 quality·sizes·alt, next.config images(formats·qualities).

## 확인
- tsc · eslint · vitest · next build 통과.
- 배포 후 Pixel 5 `/course/도쿄/2박3일`: 지도 응답 AVIF(또는 WebP) 100KB 이하, 위치·비율 동일, 오류 0, 도쿄 LCP < 3.4초(목표 2.5초 근처), 제주·다낭 악화 없음.
- `/api/content/course-map?region=도쿄&days=3&v=…` 원본 1200×630 PNG 유지. `/api/health` ok · 경고 0 · maps `static` 튀지 않음.
- Vercel Hobby 이미지 변환 한도: 형식 2 × 지도 수 × 폭 수 를 숫자로.

## 하지 말 것
COURSE_ALGO_VERSION 올리기 · 특정 호텔 추천 · Static Maps 호출 늘리기/새 유료 서비스 · 코스 내용·디자인 변경 · `/api/content/course-map` 원본 응답·블로그 URL 변경 · 비밀값·환경변수·`.github/workflows/claude.yml` 수정.
