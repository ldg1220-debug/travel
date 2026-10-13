# 작업 지시서 — #314 검증: 지도 복구 확인. health 정지 판정 · 과거 경로 Blob 읽기 생략

작성: 2026-10-13 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `cfc1496`(#314) 라이브 실측 (Cowork)

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-13_pr314-health-legacy.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 0-1. 배경

#314 에서 코스 지도를 Blob 없이 `/api/content/course-map` 이 직접 PNG 로 응답하게 바꿨습니다. Blob 스토어는 Hobby 한도 초과로 11/11 까지 정지 상태입니다. 이번 작업은 그 후속 정리 2건입니다.

## 1. 라이브 확인 결과 (됨)

```
course-map?region=오사카&days=3&day=1   200 image/png · ETag "4c22e4ba0db225ae-d1" · If-None-Match → 304 · 재요청 x-vercel-cache HIT
course-brief 오사카 3                    imageUrl …/course-map?region=오사카&days=3&v=4c22e4ba0d · dayImageUrls 3개
/api/blob/course-maps/overseas/세부/7/v22.png · /d1/v22.png   → course-map → 200 image/png
maeilg.com/269                          본문 지도 8장 모두 위 과거 경로(v22, d1~d7) → 복구됨
/api/health                             503 · blob.status "error" · "Vercel Blob: Failed to fetch blob: 403 Forbidden" · advancedOpsEstimate 0 · staticMapsKey true
```

## 2. 고칠 것

```
① health: Blob 정지 판정
   현재 정지 응답이 "Failed to fetch blob: 403 Forbidden" 으로 와서 status 가 "error" 로 나옴
   → 403 · "Forbidden" · "suspended" · "usage limit" 를 모두 "limit" 으로 분류 (업로드·플레이스홀더 쪽 판정 함수도 같은 것을 쓰게)
   → 테스트: 403 Forbidden 메시지 → limit

② 과거 지도 경로는 Blob 을 읽지 않고 바로 302
   /api/blob/course-maps/** 는 이제 Blob 에 새로 쓰이지 않으므로, Blob 읽기 시도 없이 곧바로 course-map 으로 302
   (정지 중 매 요청 Blob 실패 왕복 제거 · 11/11 이후에도 Simple op · 전송량 0)
   302 응답 Cache-Control: public, s-maxage=2592000 (경로가 버전 고정이라 바뀌지 않음)
   plan-maps/** 과거 경로도 같은 방식(해당 og 라우트로 302)이 가능하면 함께
```

## 3. 순서 · 버전

| | 작업 | 규모 |
|---|---|---|
| 1 | ① health 판정 | 극소 |
| 2 | ② 과거 경로 즉시 302 | 극소 |

`COURSE_ALGO_VERSION` 은 올리지 않음 (코스 결과 변화 없음).

## 4. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| /api/health | 503 · blob.status "limit" (11/11 이후 "ok") |
| /api/blob/course-maps/overseas/세부/7/d3/v22.png | 302 즉시 · 최종 200 image/png |
| maeilg.com/269 · /277 | 지도 표시 유지 |

---

## 처리 결과

- ① `isBlobLimitError` 가 403 · Forbidden · suspended · usage limit 를 모두 한도·정지로 분류(health `blob.status:"limit"`, 업로드 오류 안내가 같은 함수 사용). 후기 사진 조회 플레이스홀더는 오류 종류와 무관하게 Blob 읽기 실패 전부에 적용(#314 부터).
- ② `/api/blob/course-maps/**` 와 `/api/blob/plan-maps/{token}/{ms}.png` 는 Blob 을 읽지 않고 곧바로 302 (`Cache-Control: public, s-maxage=2592000`) → course-map / `/api/og/plan/{token}.png?v={ms}`.
- 테스트: 403 Forbidden → limit, 과거 경로는 Blob get 호출 0회, health 라우트 3건.
- `COURSE_ALGO_VERSION` 은 올리지 않음(40 유지).
