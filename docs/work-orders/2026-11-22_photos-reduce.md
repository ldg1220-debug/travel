# [Cowork 지시서] 사진(photos) 사용량 — 계수 오류 · 열린 엔드포인트 · 고정 카드 사진

이슈 #382 · 2026-11-22 · Cowork. 원문 지시서는 이슈 본문 참고(①~⑥, 확인·하지 말 것 포함).

## 요약
- ① photos/text-pro 는 Google 에 실제 요청을 보낸 경우에만 기록(메모·CDN·DB 캐시 적중은 미기록)
- ② `/api/discover/spot-photo` 는 서버가 아는 키만 · 봇/외부 Referer/IP 분당 상한 → 플레이스홀더
- ③ 고정 카드(/discover 큐레이션·홈 4장)는 한 번 저장한 자체 이미지(Blob, 출처·라이선스 표기)
- ④ 게시글 카드는 글의 Blob 사진 → 지역 대표 이미지(③) → 아이콘. 제목으로 q 를 만들지 않음
- ⑤ 동적 카드는 상세를 열 때만 사진 요청, 이름→place_id·photoUri(1일 TTL) DB 저장
- ⑥ 사진 응답 CDN 1일 캐시 실적용 확인

## 하지 말 것
- COURSE_ALGO_VERSION 변경 · Google 사진/photoUri 1일 초과 저장 · CDN 캐시 1일 초과 · 출처 표기 없는 외부 이미지 · 환경변수/Google Cloud 설정 변경

## 진행
- 1차 실행(이 PR): ①②④ — 부분. 남은 것: ③ · ⑤ · ⑥ · ②의 "서버가 아는 키만" 부분
