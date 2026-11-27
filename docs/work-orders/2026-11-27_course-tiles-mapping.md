# 작업 지시서 — 코스 만들기 지역 타일 이미지 매핑 보강 (#441 후속)

작성: 2026-11-27 16시 · Cowork · 이슈 #443

## 0. 먼저
1. 이 본문을 `docs/work-orders/2026-11-27_course-tiles-mapping.md` 로 저장, 완료 지시서 10개 유지(가장 오래된 것부터 삭제), 본 작업과 같은 PR.

## 0-1. 근거 (11/27 16시 운영·main 실측)
- #442 병합·배포 후 `/course` 국내→부산까지: Google 사진 요청(spot-photo·places/photo) 0건, 저장소 webp 만 로드.
- `courseTileImage()` 매핑 결과: 해외 2단계(대륙) 0/6, 국내 2단계(광역) 4/9, 3단계 국내 8/61 · 해외 10/26.
- 해외 여행 첫 화면 6칸이 모두 그라데이션이라 "고장 난 화면"처럼 보임.
- `public/discover/spots/` 에 이미 32장(출처·라이선스 메타 포함) — 새 이미지 없이 매핑만으로 개선 가능.

## 1. 할 것
1. `src/lib/courseTileImages.ts` 의 `LABEL_TO_IMAGE_ID` 에 기존 이미지 id 만 추가(지역을 실제로 보여주는 경우만):
   - 대륙: 아시아(o-t5/o-th1), 유럽(o-fr1/o-it1), 북미(o-us1). 나머지는 그라데이션.
   - 국내 광역: 전라(d-t8), 경상(d-f5). 경기·강원·충청은 맞는 이미지 없으면 그대로.
   - 3단계: `discoverSpotImages.ts` 메타로 지역이 정확히 일치하는 것만.
   - 옆 타일끼리 같은 사진 겹치지 않게.
2. `courseTileImages.test.ts` 보강: 해외 2단계 ≥3, 국내 2단계 ≥6, 경로 `/discover/spots/` + 파일 존재.
3. PR 본문에 단계별 매핑 수 변경 전→후 표.

## 2. 확인할 것
- tsc · eslint · vitest · next build 통과.
- 배포 후 `/course` 해외: 아시아·유럽·북미 사진+출처, 나머지 그라데이션+핀. spot-photo·places/photo 0건 유지.
- 국내: 전라·경상 타일 사진 표시.

## 3. 하지 말 것
- COURSE_ALGO_VERSION 올리기 · 특정 호텔 추천
- 새 외부 이미지 추가·다운로드, Google 사진 호출 재도입
- 타일 배치·크기·순서·코스 내용 변경
- 비밀값·환경변수·`.github/workflows/claude.yml` 수정
