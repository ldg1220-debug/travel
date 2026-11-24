# 작업 지시서 — spot-photo: 사진 한도에 닿은 뒤에도 text-pro 검색을 계속 쓰는 문제 (이슈 #388, autopilot 2026-11-24)

## 근거
2026-11-24 health: photos 일 한도 33/33 도달 후에도 spot-photo 가 text-pro 를 79건 사용. 라우트가 검색 → 그 다음에야 photos 예약 순서라, 한도가 찬 날 검색만 낭비됨.

## 할 것
1. photoName 메모가 없을 때 검색 전에 photos 월·오늘 한도 여유를 예약 없이 확인(`hasMapsHeadroom`). 없으면 BUDGET_SKIP 404. DB 장애로 숫자를 못 읽으면 기존 동작.
2. route.test.ts: 한도 찬 상태 새 q → searchText 0회·404.
3. 같은 순서 문제가 다른 photos 경로에 있는지 확인.

## 제약
COURSE_ALGO_VERSION·한도 숫자·워밍 변경 없음. 호출 수만 줄어듦.
