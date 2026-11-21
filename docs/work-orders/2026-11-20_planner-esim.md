# 작업 지시서 — 계획 화면 해외 eSIM 제휴 링크 (autopilot 자체 작성)

작성: 2026-11-20 · Autopilot

## 근거
- DIRECTION "제휴 동선": 계획 화면에서도 링크가 보이고 클릭 이벤트가 남아야 함.
- 코스 페이지에는 eSIM(Yesim·Airalo)이 있으나 PlannerBoard 에는 숙소 선택 모달뿐 eSIM 없음.

## 할 것
1. EsimAffiliateLinks 에 surface("course"|"planner")·className prop 추가(기본값은 기존 동작 유지).
2. PlannerBoard 숙소 모달 하단에 해외(!isDomestic) 계획일 때 eSIM 링크 표시. sub_id=planner_esim, esim_click surface=planner.

## 하지 않는 것
- 특정 상품 추천·유료 사용 증가·새 API 없음.
