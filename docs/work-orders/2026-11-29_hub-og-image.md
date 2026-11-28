# [Cowork 지시서] 코스 모음(/course/all)·지역 허브(/course/{지역}) 공유 미리보기 이미지(og:image) 누락 보완

이슈 #469 · 2026-11-29

## 0-1. 근거
- `/course/all`, `/course/하노이`, `/course/경주` HTML 에 `og:image` 0개 (`twitter:image` 는 `/opengraph-image`).
- 원인: `course/all/page.tsx`, `course/[region]/page.tsx` 가 `openGraph` 를 따로 정의하면서 레이아웃 openGraph(이미지 포함)가 통째로 교체됨(얕은 병합). 홈은 이미 수정됨.
- 덤: `/discover` 는 `og:url` 이 없음.

## 1. 할 것
1. `/course/all` openGraph 에 `images`(기본 `/opengraph-image`, 1200×630, alt) · `locale: "ko_KR"`.
2. `/course/{지역}` 허브 openGraph 에 `images` — 대표 코스 상세 페이지가 쓰는 course-map URL(같은 `v=`) 재사용, 없으면 `/opengraph-image`. `twitter.images` 도 같은 값.
3. `/discover` 에 `og:url`(`/discover`) + images 명시.
4. 테스트: 세 페이지 `openGraph.images` 비어 있지 않음, 허브 이미지 URL == 대표 상세 og 이미지 URL.

## 2. 확인할 것 (병합·배포 후)
- `curl -s https://www.tradule.co.kr/course/all | grep -c 'property="og:image"'` ≥ 1
- `/course/하노이` 의 og:image → `/api/content/course-map?region=하노이&days=4&v=…` (상세 `/course/하노이/3박4일` 과 동일)
- `/discover` 에 `property="og:url"` 1개
- `/api/health` `.ok == true`, maps `static` 오늘 사용량 급증 없음

## 3. 하지 말 것
- COURSE_ALGO_VERSION 올리기·특정 호텔 추천 금지
- 새 지도 이미지 생성·새 유료 API 호출·워밍/색인 코스 수 변경 금지
- 비밀값·환경변수·`.github/workflows/claude.yml` 수정·디자인 변경 금지
