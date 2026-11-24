# 작업 지시서 — spot-photo: 사진 한도에 닿은 뒤에도 텍스트 검색(text-pro)을 계속 쓰는 문제

작성: 2026-11-24 · Cowork (이슈 #388)

## 근거 (2026-11-24 16:18 KST `/api/health` 실측)
- `maps.photos`: 오늘 33 / todayLimit 33 (일 한도 도달), 월 666/1000(67%). 화면별: discover 29 · course 4.
- `maps.text-pro`: 오늘 241 / todayLimit 246, 월 2771/5000(55%). 이 중 `user:spot-photo` 79건 — 같은 날 spot-photo 가 실제로 쓴 photos 는 24건.
- 원인: spot-photo 는 photoName 메모가 없으면 먼저 Text Search(text-pro)를 부르고 그 다음에야 `reserveMapsOp("photos")` 로 한도를 확인한다. 사진 일 한도가 찼으면 검색 결과를 버리고 404 → text-pro 만 헛되이 쓰인다.

## 할 것
1. photoName 메모가 없을 때 Text Search 전에 photos 오늘·월 한도 여유를 먼저 확인(예약 X, 기존 mapsBudget 함수 재사용). 여유 없으면 Google 호출 없이 기존 `BUDGET_SKIP` 404. photoUri/photoName 메모 적중 경로는 그대로. DB 장애로 숫자를 못 읽으면 지금 동작(검색 진행).
2. 테스트(`route.test.ts`): 일 한도 찬 상태에서 새 q → searchText fetch 0회, text-pro 기록 0, 404. 여유 있을 땐 기존과 동일.
3. (선택) `/api/places/photo` 등 같은 조건의 다른 경로가 있으면 맞춘다. 없으면 PR 에 "없음".

## 확인할 것
- tsc · eslint · vitest · next build 통과.
- 배포 후 photos 한도 도달한 날 health `text-pro.todayBySource.user:spot-photo` 가 photos 의 `user:spot-photo` 와 비슷한 수준인지.
- `/discover` 에서 사진 한도 후에도 카드가 아이콘 타일로 정상 표시.

## 하지 말 것
- COURSE_ALGO_VERSION 올리기 금지 · 특정 호텔 추천 금지.
- 한도(freeLimit·MAPS_BUDGET_RATIO·일 페이싱) 숫자 상향, 워밍·색인 코스 수 변경 금지.
- #382 ③·⑤ DB 저장·② 서버 키 한정은 이번 범위 아님.
