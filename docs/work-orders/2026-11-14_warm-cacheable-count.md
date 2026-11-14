# 작업 지시서 — 워밍 결과에 '저장 대상' 건수 추가 (autopilot, 2026-11-14)

## 근거
- /api/health 11/14 18:43Z: 마지막 워밍(05:43Z) 처리 12건 성공인데 indexed.missing = 12 (fresh 0). 코드상 키·TTL 불일치는 확인되지 않음.
- 워밍이 "성공"이어도 brief 가 캐시 조건(isFreshBriefPayload/isCacheableBrief)을 못 넘으면 저장되지 않는다. 이를 구분할 계측이 없다.

## 할 것
1. 워밍 결과 항목에 cacheable(isFreshBriefPayload) 추가, health lastWarmResult 에 "저장대상 N" 표기.
- 코스 생성 로직·COURSE_ALGO_VERSION·외부 API 호출 변화 없음.
