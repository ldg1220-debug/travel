# 작업 지시서 — 식사 0 일 구분 계측 (2026-11-17, Autopilot)

근거: health lastAnchorReport.mealsPerDay 가 11/03 도쿄 [1,2,0], 11/17 오사카 [1,1,0] 으로 3일차가 0.
종일시설 날(정상)인지 식당 후보 부족인지 health 로 구분 불가.

## 할 것
- lastAnchorReport 에 facilityDays(날별 종일시설 포함 여부) 추가. 생성 로직·API 호출 변화 없음(계측만).
