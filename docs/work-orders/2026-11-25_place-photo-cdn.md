# 작업 지시서 — /api/places/photo CDN 1일 캐시

작성: 2026-11-25 · Autopilot

## 근거
- health 11/25: photos 월 687/1000(69%) > 50% 기준 초과. 오늘 21건 전부 user:place-photo(discover 화면).
- 리다이렉트(302)는 Vercel CDN 이 캐시하지 않음(#382, spot-photo 에서 실측).

## 할 것
1. places/photo: photoUri 이미지를 받아 200 + `s-maxage=86400` (실패 시 리다이렉트 폴백). 1일 초과 캐시 없음.
