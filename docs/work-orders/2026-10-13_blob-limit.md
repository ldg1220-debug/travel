# 작업 지시서 v2 — 긴급: Vercel Blob 한도 초과로 지도·후기 사진 전부 차단 (원인 확정)

작성: 2026-10-13 · 대상: **트레쥴** (`ldg1220-debug/travel`)
**`TRADULE_2026-10-13_긴급_코스지도이미지500.md` 를 대체합니다.** (원인을 Vercel 대시보드에서 확정)

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-13_blob-limit.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 1. 원인 (Vercel → Storage → Blob `Tradule_review`, Hobby)

```
"You have reached your usage limits for this store using the Hobby plan. Access resumes on 26. 11. 11."
Advanced Operations   2k / 2k     ← 한도 도달 (put · list · copy 류)
Simple Operations     488 / 10k
Storage               265 MB (평균 131 MB / 1 GB)
Data Transfer         140 MB / 10 GB
폴더                  course-maps/ · plan-maps/ · reviews/
```

**한 스토어에 사용자 후기 사진(reviews/)도 같이 있어서, 지도뿐 아니라 앱의 후기 사진 조회·업로드도 11/11 까지 막혀 있습니다.**

Advanced 2,000회를 다 쓴 주범은 코스 지도 put 으로 보입니다 — `COURSE_ALGO_VERSION` 을 올릴 때마다(이번 달 v22 → v39) 지역 × 일수 × (전체 + 일자별 N장) 지도를 새 경로로 다시 업로드했고, 크론이 매일 이를 반복했습니다.

## 2. 결정 — 무료 유지 (Pro 업그레이드 안 함)

Vercel 문서 기준: Hobby 포함량은 **월 단위**(Advanced 2,000/월 등), 초과 시 과금 대신 **30일간 Blob 사용 중지** → 11/11 해제.
또 **Vercel 대시보드에서 Blob 스토어를 열람·조회하는 것도 Advanced Operation 으로 집계**됩니다.

- 지도: Blob 을 쓰지 않는 구조로 바꿔 **지금 바로 복구** (§3 ②③)
- 후기 사진(reviews/): 11/11 해제까지는 안내 문구로 버티고, 해제 후에는 Blob 을 **후기 사진 전용**으로 사용 (지도 put 이 빠지면 월 2,000 은 후기 업로드에 충분)
- 다른 저장소 이전(R2 등)은 하지 않음 — 계정·결제수단 등록이 필요할 수 있어 보류

## 3. 할 것

```
① 코스 지도 put 줄이기 (필수)
   - 지도 경로를 COURSE_ALGO_VERSION 이 아니라 "지도 내용 해시"(스팟 좌표·순서·일자 묶음)로 — 버전이 올라도 코스가 같으면 재업로드 없음
   - 크론은 지도 업로드를 하지 않음 (지도는 코스 페이지 첫 방문 때만, 하루 최대 N건 상한)
   - blob list 호출 제거(존재 확인이 필요하면 head = simple op)
② 지도를 Blob 없이 서빙 (필수 — 한도와 무관하게 견고하게)
   /api/content/course-map?region=&days=&day= 가 PNG 를 직접 생성해 응답
   Cache-Control: public, s-maxage=2592000, stale-while-revalidate=86400 · ETag = 지도 내용 해시
   → Vercel CDN 이 캐시. Blob 저장 불필요
   course-brief.imageUrl / dayImageUrls · 코스 페이지 og:image 는 이 URL 로
③ 과거 경로 호환 (필수 — 발행된 블로그 지도 복구)
   /api/blob/course-maps/{scope}/{region}/{days}/v{N}.png · /d{n}/v{N}.png
   → Blob 에서 못 읽으면 ② 의 course-map URL(같은 region/days/day)로 302
   블로그 HTML 수정 없이 /269 · /272 · /277 등 지도 복구
④ 후기 사진(reviews/) — 11/11 해제까지
   조회 실패 시 깨진 이미지 대신 "사진을 잠시 불러올 수 없어요" 플레이스홀더
   업로드 시 한도 오류면 "사진 업로드가 잠시 중단됐어요 — 글은 저장됩니다" (글 저장은 사진 없이 성공)
   plan-maps/ 도 지도와 같은 방식(§2 ②, Blob 없이 CDN)으로 전환 — 지도 계열은 Blob 에 다시 쓰지 않음
⑥ Blob 사용 예산 가드: 서버에서 월 Advanced 사용량 추정 카운터(DB) — 1,500 넘으면 후기 업로드 외 put 금지 + 로그
⑤ /api/health 에 blob 상태(읽기 1회 · 한도 오류 감지) 포함
```

## 4. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | ② CDN 지도 + ③ 과거 경로 302 | 소~중 · **최우선** (Blob 없이 지도 복구) |
| 2 | ① put 줄이기 | 소 |
| 3 | ⑤ health | 극소 |
| 4 | ④ 후기 사진 안내 · plan-maps 전환 · ⑥ 예산 가드 | 소 |

참고: 지도 PNG 는 지금처럼 Google Static Maps 로 그리되, CDN 캐시(HIT)로 재요청을 막아 Google 무료 사용량 안에 두세요. 지도 생성 횟수를 로그로 남겨 월 사용량을 볼 수 있게.

## 5. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| /api/blob/course-maps/overseas/세부/7/v22.png | 302 → course-map → 200 image/png |
| /api/content/course-map?region=오사카&days=3&day=1 | 200 image/png · Cache-Control s-maxage |
| course-brief 오사카 3 | imageUrl · dayImageUrls 채워짐 |
| maeilg.com/269 · /277 | 지도 표시 |
| Vercel Blob Advanced Operations | 이후 증가 없음(또는 미미) |

---

## 처리 결과

- 같은 날 먼저 온 `efbbed45-TR13791.MD`(Pro 업그레이드 선택지 포함)와 `TRD2D51.MD`(코스지도 500 — 원인 조사 요청)는 이 지시서(§2 무료 유지 결정)가 대체한다고 판단해 이 문서만 저장.
- ② 코스 지도를 Blob 없이: 지도 입력(스팟 좌표·경로선·일자 묶음)을 DB(`course-map-input:{지역}:{일수}`, 버전 무관)에 저장하고 `imageUrl`/`dayImageUrls` 는 `/api/content/course-map?region=&days=[&day=]&v={해시}`. 라우트가 Static Maps PNG 를 직접 응답(`Cache-Control: public, s-maxage=2592000, stale-while-revalidate=86400`, ETag = 지도 내용 해시[-d일자], If-None-Match → 304). `COURSE_ALGO_VERSION` 39 → 40(v39 캐시는 imageUrl 이 null).
- ① put 제거: 지도 생성 경로에서 Blob put/list 호출이 없어짐(크론 포함). 해시는 스팟 좌표(5자리)·순서·경로선·일자 묶음 — 코스가 같으면 URL 이 안 바뀐다.
- ③ `/api/blob/course-maps/{scope}/{region}/{days}[/d{n}]/v{N}.png`: Blob 에서 못 읽으면(오류·없음) 같은 region/days/day 의 course-map 으로 302.
- ④ 후기 사진: `/api/blob/…` 조회 실패 → "사진을 잠시 불러올 수 없어요" SVG 플레이스홀더(no-store). 업로드: 한도·정지 오류·예산 초과 → 503 "사진 업로드가 잠시 중단됐어요 — 글은 사진 없이 저장돼요"(작성 화면은 글 저장과 업로드를 별개 요청으로 처리). plan-maps: `/api/og/plan/{token}.png` 가 PNG 를 직접 응답(s-maxage 1일 + ETag=updated_at), 페이지 메타의 URL 에 `?v=updated_at`.
- ⑥ `blobBudget.ts`: 달력 월 키 `blob-ops:YYYY-MM` 추정 카운터 — 후기 업로드 put 마다 +1, 1,500 초과 시 후기 외 put 금지(현재 후기 외 put 없음), 1,950 초과 시 후기도 거절, 로그 `[blobBudget]`.
- ⑤ `GET /api/health`: DB 1회 + Blob 읽기 1회(없는 경로 get = Simple Op) + 이번 달 Advanced 추정치. 한도/정지 오류면 `blob.status:"limit"` + 503.
- 지도 생성 횟수 로그: `[courseMap] rendered hash= day= bytes=` (CDN HIT 은 찍히지 않음).
- 한계/미확인: Vercel 이 `s-maxage` 를 지키는지, 실제 Static Maps 응답·502 빈도, Blob 정지 해제(11/11) 전 후기 사진 동작은 운영에서만 확인 가능. 달력 월 카운터는 Vercel 빌링 주기와 다를 수 있음. 계정 삭제(accountDeletion)의 list/del 은 카운터에 안 셈.
