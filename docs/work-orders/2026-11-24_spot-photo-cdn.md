# 작업 지시서 — spot-photo CDN 1일 캐시 · 후보 카드 사진 요청 제거 (#382 ⑤⑥ 일부)

작성: 2026-11-24 · Autopilot (이슈 #382 의 claude/issue-382-20261123-0240 브랜치 PR 개설)

## 근거
- #382 ⑤⑥: 307 응답은 Vercel CDN 이 캐시하지 않아 같은 사진이 매번 함수 실행·Google 호출.
- health 11/24: photos 월 666/1000(67%), 오늘 33/33 상한 도달.

## 할 것
1. spot-photo: photoUri 이미지를 서버에서 받아 200 + `s-maxage=86400` 응답 (실패 시 기존 리다이렉트 폴백). 1일 초과 캐시 없음.
2. photoName 없는 후보 카드(코스 만들기·Discover LivePlace)는 목록에서 spot-photo 를 부르지 않음.

## 남은 것 (#382)
③ 고정 카드 자체 이미지 · ⑤ place_id/photoUri DB 저장 · ② 서버 키 한정 — 동근님 결정 필요.
