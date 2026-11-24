# [Cowork 지시서] /discover 큐레이션 카드 93개 — 저장소 public 폴더 자체 이미지로 교체 (#382 ③)

이슈 #389 본문 요약 (원문은 이슈 참조).

- 결정(2026-11-24): 고정 카드 이미지는 Blob 대신 저장소 `public/` 에 저장. 비밀값·Blob 토큰 불필요.
- 근거: `maps.photos` 일 한도 33/33, 그중 discover 29(88%). 큐레이션 SpotCard 가 카드마다 `/api/discover/spot-photo` 호출.
- 할 것: ① `public/discover/spots/{id}.webp`(480px, 60KB↓) ② 출처 기록 `src/lib/discoverSpotImages.ts` (위키미디어 공용 CC BY/BY-SA/CC0/PD · 한국관광공사 공공누리만)
  ③ 수집 스크립트 `scripts/fetch-discover-spot-images.mjs`(키 불필요) ④ SpotCard: 이미지 있으면 파일, 없으면 아이콘 타일, 큐레이션 카드의 spot-photo 호출 제거(live: 은 범위 밖)
  ⑤ 카드에 출처 표기 ⑥ 다른 화면의 spot-photo 잔여 호출처 목록화 ⑦ 테스트
- 확인: tsc · eslint · vitest · next build / 배포 후 health `photosByScreenToday.discover`≈0 / `public/discover/spots` 합계(목표 6MB↓)
- 금지: COURSE_ALGO_VERSION 변경, 특정 호텔 추천, 라이선스 불분명·Google 사진 저장, Blob·환경변수·비밀값·한도 숫자 변경, 카드 디자인 큰 변경
