# 작업 지시서 — Cowork 점검 클릭을 제휴·저장 흐름·방문 집계에서 빼기

작성: 2026-11-27 18시 · Cowork (이슈 #445)

## 요약
- 근거: 11/27 `/api/health` `affiliateClicks` 오늘 6건(airalo·yesim·klook-hotel·trip·klook 2) · 7일 7건이 Cowork 16시 점검 클릭과 일치. `saveFunnel` plan_copy_* 도 점검 재현분 포함.
- 원인: Cowork 점검 UA 는 일반 Chrome Mobile 이라 `classifyVisit()` 가 human 으로 분류.

## 할 것
1. `src/lib/botUserAgent.ts` `BOT_TOKENS` 에 `tradulecowork` 추가(단어 경계·대소문자 무시). internal 로 넣지 않는다(동기 빌드 → 유료 호출 가능). bot 이면 방문 집계·백그라운드 재생성·`shouldSkipTracking` 에서 모두 빠지고 코스 페이지는 캐시만 보여준다.
2. 테스트: `... TraduleCowork/1.0` + Accept-Language → `classifyVisit(...,"page")==="bot"`, `shouldSkipTracking===true`; 표식만 뺀 UA 는 human.
3. 이미 쌓인 집계 숫자는 고치지 않는다. PR 본문에 "11/27 제휴·저장 흐름 숫자 중 Cowork 점검분 포함" 메모만.

## 확인할 것
- tsc · eslint · vitest · next build 통과.
- 배포 후 `TraduleCowork/1.0` UA 로 입장권/eSIM 링크 클릭 시 이벤트 요청은 나가지만 `/api/health` `affiliateClicks` 오늘 숫자가 늘지 않음.
- 일반 휴대폰 UA 분류는 그대로 human.

## 하지 말 것
- COURSE_ALGO_VERSION 변경 · 특정 호텔 추천 · 기존 집계 데이터 수정/삭제 · internal 범위 확대 · 다른 봇 토큰/패턴 변경 · 제휴 링크 변경 · 비밀값/환경변수/`.github/workflows/claude.yml` 수정
