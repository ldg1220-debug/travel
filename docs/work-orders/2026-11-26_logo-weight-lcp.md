# [Cowork 지시서] 페이지 속도 — 모든 페이지가 로고 PNG 755KB(900×1113)를 먼저 받음, 코스 페이지 LCP 4.0~5.7초

(이슈 #421 본문 요약 저장 — 원문은 이슈 참조)

## 근거 (2026-11-26 14시 KST 운영 실측, Pixel 5 · 느린 4G · CPU 4배)
| 페이지 | LCP | LCP 요소 | 이미지 총량 |
|---|---|---|---|
| `/course/도쿄/2박3일` | 5.68초 | 동선 지도 | 849KB |
| `/course/제주/2박3일` | 3.96초 | 동선 지도 | 849KB |
| `/` | 3.00초 | hero-skyline.png | 952KB |

`/brand/tradule-logo.png` 755KB 가 layout.tsx preload 로 모든 페이지에서 먼저 받아져 LCP 이미지와 대역폭을 다툰다.

## 할 것
1. `public/brand/` 로고 6개를 표시 크기 2배로 줄이고 압축(emblem ≤ 80KB, wordmark ≤ 25KB). 경로 유지. OG 는 필요하면 전용 사본.
2. layout.tsx 로고 preload 유지 여부 판단·근거 기재.
3. BrandLogo `<img>` 에 width/height.
4. vitest 로 파일 크기 상한 검사.

## 확인
- tsc · eslint · vitest · next build. PR 에 전/후 크기 표.
- 배포 후: `/course/도쿄/2박3일` 이미지 총량 ≤ 200KB, LCP 단축, 로고 또렷(390px), `/api/health` ok=true.

## 하지 말 것
COURSE_ALGO_VERSION · 특정 호텔 추천 · 비밀값/env/claude.yml · 로고 디자인 변경 · 경로 변경(OG 사본 예외) · 동선 지도 생성 방식/Static Maps 호출/유료 API.
