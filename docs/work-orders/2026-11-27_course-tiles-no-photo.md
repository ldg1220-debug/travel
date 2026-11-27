# [Cowork 지시서] 코스 만들기 지역 타일 — Google 사진 없이 (2026-11-27, 이슈 #441)

사진 사용량 73%(728/1000), 오늘 41/42 전부 `/course` 화면(`photosByScreenToday.course=41`). 원인: `CourseClient.tsx` `TilePhoto` 가 고정 검색어로 `/api/discover/spot-photo` 를 타일마다 호출.

## 할 것
1. `TilePhoto` 가 spot-photo(Google)를 부르지 않게. 1단계 2장은 `public/discover/spots/` 기존 이미지(국내 1·해외 1, 출처 표기 기존 방식), 2·3단계는 저장소 이미지가 있는 지역만 그 이미지, 없으면 그라데이션+핀.
2. 새 외부 이미지 추가 금지(기존 파일 재사용만).
3. `CourseSpotCard`(`/api/places/photo`)는 범위 밖.
4. 테스트: 1~3단계 타일에 spot-photo 없음, 1단계 2장 이미지 경로.
5. PR 본문: 변경 전 한 번 훑을 때 spot-photo 요청 수(타일 수 기준) → 후 0.

## 확인
tsc · eslint · vitest · next build. 배포 후 `/course` 국내→광역→시/군 네트워크에 spot-photo 0건, 타일 모양 그대로. 다음 날 `photosByScreenToday.course` 감소.

## 하지 말 것
COURSE_ALGO_VERSION 올리기 · 특정 호텔 추천 · 코스 내용/순서/동선·타일 배치/크기 변경 · 출처 없는 외부 이미지 · Google 사진 저장 · 비밀값/환경변수/`.github/workflows/claude.yml` 수정.
