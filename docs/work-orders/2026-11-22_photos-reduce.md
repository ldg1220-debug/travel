# 작업 지시서 — 사진(photos) 사용량: 계수 오류 · 열린 엔드포인트 · 고정 카드 사진

작성: 2026-11-22 · Cowork (이슈 #382)
선행: #381(페이싱·계측) 브랜치 `claude/issue-381-…` 와 충돌하면 #381 먼저 병합 후 그 위에서 작업.

## 0. 먼저
1. 이 본문을 `docs/work-orders/2026-11-22_photos-reduce.md` 로 저장, 완료 지시서 10개 유지, 본 작업과 같은 PR.

## 0-1. 근거 (11/22 11시 운영 실측 — Vercel Request Logs + /api/health)

| 관찰 | 근거 |
|---|---|
| **① health photos 카운터가 실제 Google 호출이 없어도 올라감** | 같은 q 재요청 시 Vercel 로그 External APIs 비어 있음(메모리 적중) → 그런데 health `photos.todayCount` 106→107, text-pro 는 그대로. `성산일출봉`·`황남빵`·`탕롱황성 (복사)` 요청 모두 외부 호출 0건인데 카운트됨. **월 619(62%)가 실제보다 부풀려졌을 가능성** |
| **② 아무 q 나 받아 과금** | `q=탕롱황성(昇龍皇城) 하노이 여행 코스 x1795314646475`(임의 문자열) → searchText + photos/media 실제 호출. 봇·누구나 한도를 소진시킬 수 있음 |
| **③ 홈 카드 q 를 게시글 제목으로 만듦** | `경주 황리단길 2025 09 도쿄`, `캐널시티 하카타 5월22일 ~ 26일 후쿠오카`, `원조소문난칼국수 7월18일 동래`, `… 코스 (복사)`. 엉뚱한 사진·매번 새 검색. 이 글들엔 이미 직접 올린 사진(`/api/blob/reviews/…`)이 있음 |
| **④ 고정 카드가 방문자마다 사진 호출** | `/discover` 큐레이션 8장(경복궁·성산일출봉·전주 한옥마을…)은 내용이 고정인데 새 브라우저마다 spot-photo. 홈 4장 동일 |
| **⑤ CDN 이 307 을 캐시하지 않음** | 11:17·11:31 같은 화면 요청이 모두 Function Invocation 으로 기록(CDN 적중이면 함수 실행 없음). 메모리 캐시는 콜드스타트·배포 때 사라져 11:17 `경복궁`은 searchText+photo 재호출 |
| ⑥ 오늘 text-pro 96건이 전부 `user:spot-photo` | 사진 1장 = 텍스트 검색 1 + 사진 1, 두 SKU 를 같이 씀 |
| 코스 상세 페이지 | 사진 0건 ✅ |

## 1. 할 것 (순서대로)

① **카운터 수정** — `photos`(및 spot-photo 의 text-pro)는 Google 로 실제 요청을 보낸 경우에만 기록. 메모리·CDN·DB 캐시 적중은 기록하지 않음(필요하면 `cacheHit` 별도 카운트).

② **엔드포인트 잠그기** — `/api/discover/spot-photo` 는 자유 문자열 q 대신 **서버가 아는 키만** 받음:
   - 큐레이션/홈/스크랩북 카드: 카드 id(또는 저장된 place_id)
   - 알 수 없는 키 → 404 + 플레이스홀더, Google 호출 없음
   - 봇 UA(Googlebot·bingbot 등)·Referer 가 우리 도메인이 아닌 요청 → 플레이스홀더
   - IP당 분당 상한(예: 30) 초과 → 플레이스홀더

③ **고정 카드는 Google 사진을 쓰지 않음** — `/discover` 큐레이션·홈 고정 카드 이미지는 **한 번 저장해 계속 쓰는 자체 이미지**로 교체(Blob 저장).
   - 국내: 한국관광공사 TourAPI `firstimage`(공공누리 유형 확인 후 출처 표기) 또는 Wikimedia Commons(라이선스·저작자 표기)
   - 해외: Wikimedia Commons
   - 이미지 출처·라이선스를 데이터 파일에 함께 저장. Google 사진은 장기 저장 금지(약관)라 이 방식만 영구 저장 가능

④ **게시글 카드는 게시글 사진 사용** — 홈 "여행 일정/후기" 카드는 글에 첨부된 Blob 사진 → 없으면 지역 대표 이미지(③) → 없으면 아이콘. **제목으로 q 를 만들지 않음.**

⑤ **동적 카드(코스 만들기 후보·스크랩북)** — 첫 화면엔 카테고리 아이콘, 사진은 카드를 눌러 상세를 열 때만 요청. `place_id` 는 영구 저장 가능하므로 이름→place_id 를 DB에 저장해 searchText 재호출을 없애고, 사진 URL(photoUri)은 DB에 1일 TTL 로 저장(메모리 아님).

⑥ **CDN 캐시 실제 적용** — 사진 응답이 Vercel CDN 에 1일 캐시되는지 확인. 307 이 캐시되지 않으면 `skipHttpRedirect=true` 로 받은 photoUri 를 쓰거나 1일 TTL 저장소를 거치게 함. 1일보다 길게 하지 않음.

## 2. 확인할 것 (PR 본문에 결과)
- 같은 q 2회 요청 시 health `photos.todayCount` 가 1번만 증가(①)
- `/api/discover/spot-photo?q=아무문자열` → Google 호출 없음, 플레이스홀더(②)
- 새 시크릿 창으로 홈·/discover 열었을 때 photos 증가 수: 전 3~8 → **후 0**(③④)
- 코스 만들기 후보 목록 열기만 했을 때 photos 0, 카드 상세 열 때만 1(⑤)
- tsc · eslint · vitest · next build

## 3. 하지 말 것
- `COURSE_ALGO_VERSION` 변경
- Google 사진·photoUri 를 1일 넘게 저장, CDN 캐시 1일 초과
- 출처 표기 없이 외부 이미지 사용
- 환경변수·Google Cloud 설정 변경
