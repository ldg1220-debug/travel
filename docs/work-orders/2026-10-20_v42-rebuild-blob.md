# [트레쥴] 작업지시서 — v42가 적용되지 않습니다 (재생성 멈춤) + Blob 한도

- 저장소: `ldg1220-debug/travel`
- 실측: 2026-10-20 20:00~20:12 KST, 운영 배포본 `27de760` (#332)

---

## PR #332 검증 결과

| 확인 항목 | 결과 | 판정 |
|---|---|---|
| `/api/health` text-pro `todayLimit` | 261 (오늘 사용 29) | ✅ |
| `/api/health` 전체 | **503** — `blob: limit, "Vercel Blob: Failed to fetch blob: 403 Forbidden"` | ❌ (A-2) |
| 홍콩 d4 | 200, 16곳, 지도 이미지 정상 — **하지만 v41 결과** | ❌ (A-1) |
| 오사카 d3 · 칭다오 d3 | A-1 때문에 v42 규칙을 볼 수 없어 보류 | — |
| 페이싱 소진 시 503 | 한도에 닿지 않아 확인 못 함 | — |

---

## A-1. 직전 버전 캐시를 내보낸 뒤 재생성이 일어나지 않습니다 — 최우선

홍콩 d4를 30초 간격으로 4번 호출했습니다. Vercel 로그는 4번 모두 같습니다.

```
[courseBrief] route=course-brief region=홍콩 days=4 refresh=false
[courseBrief] enter raw=홍콩 region=홍콩 days=4 style=city version=42
[courseBrief] path=stale-while-rebuild key=content-brief:overseas:홍콩:4:v42 from=v41 spots=16
```

**그 뒤에 아무 로그도 없습니다.** 그리고 `/api/health`의 text-pro 오늘 사용량이 호출 전후 **29 → 29**로 그대로입니다. 재생성이 Places 검색을 한 번도 하지 않았다는 뜻입니다. 30초 뒤 다시 받아도 스팟 목록이 완전히 같았습니다.

### 결과적으로

**이미 캐시가 있는 지역은 v42 규칙(명소 슬롯 카페 제외, 순서 규칙, 카페 상한, 랜드마크 앵커)이 하나도 적용되지 않습니다.** 사용자에게는 v41이 계속 나가고, 제가 검증할 방법도 없습니다.

지금 나가는 홍콩 d4(v41)는 이번 PR이 고치려던 문제를 그대로 갖고 있습니다.

```
1일차: 하프웨이 커피(카페) > 벽화 > 상하이 군만두(식당) > 미드레벨 에스컬레이터 > 카페 랜드마크(카페)
        ← 첫 스팟 카페, 카페 2곳
2일차: 소호 > 대관람차 > 완차이 마켓 > 豬腳小姐(식당) > 홍콩해양공원(테마파크)
        ← 종일시설인 해양공원이 다른 4곳 뒤에 붙음
3일차: 심포니오브라이트 > 빅토리아 하버 > 템플스트리트 야시장 > 원 딤섬(식당) > 팀호완(식당)
        ← 식당 연속
4일차: 홍콩 디즈니랜드 리조트
빅토리아 피크 · 스타페리: 없음
```

### 의심되는 원인

1. **응답을 보낸 뒤 백그라운드 작업이 끊김** — Vercel 서버 함수는 응답이 끝나면 실행 중인 비동기 작업을 중단합니다. 재생성을 응답 후에 돌리려면 `waitUntil`(또는 Next.js `after()`)로 감싸야 합니다. 그냥 `promise`를 띄워 두면 시작 직후 잘립니다.
2. **재생성이 Blob 단계에서 실패** — A-2의 Blob 403 때문에 재생성 초기(캐시 조회·잠금·기록)에서 실패하고, 실패 로그가 없어 안 보이는 경우
3. 재생성을 크론에만 맡기는 설계라면, 워밍 크론이 v42를 아직 만들지 않은 경우

### 해 주실 것

- 재생성 시작·완료·실패를 각각 로그로 남기기 (`path=rebuild-start`, `rebuild-done`, `rebuild-fail reason=…`)
- 응답 후 재생성은 `waitUntil`/`after()`로 실행
- 확인 후 홍콩 d4를 한 번 강제 재생성(`refresh=true` 같은 관리자 경로가 있으면)해서 v42 결과를 볼 수 있게

## A-2. Vercel Blob 고급 작업 한도가 거의 찼습니다

```
/api/health  blob: { status: "limit", message: "Vercel Blob: Failed to fetch blob: 403 Forbidden",
                     advancedOpsLimit: 2000 }
Vercel Usage  Blob Advanced Operations 1.9K  ·  Blob Simple Operations 334
              Blob Data Storage 265.02 MB  ·  Blob Data Transfer 92.26 MB
```

Hobby 플랜의 고급 작업(`put`·`list`·`copy` 등)이 월 2,000회인데 **1,900회를 썼습니다.** 한도에 닿으면 Blob 요청이 403으로 막힙니다.

지금은 **기존 지도 이미지는 정상으로 열립니다**(홍콩 d4 전체·일차별 5장 모두 200). 막히는 건 새로 쓰는 쪽과 health의 Blob 확인입니다.

### 어디서 많이 쓰는지

코스 하나당 지도 이미지가 **전체 1장 + 일차별 N장**(홍콩 d4는 5장)입니다. 버전을 올릴 때마다 다시 만들면 `put`이 일수+1회씩 늘어납니다. 캐시 확인에 `list`를 쓰고 있다면 그것도 고급 작업입니다.

### 해 주실 것

- 고급 작업을 쓰는 곳 정리: 존재 확인을 `list` 대신 `head`(단순 작업)로, 이미 있는 이미지는 다시 `put`하지 않기
- 지도 이미지 내용이 바뀌지 않으면 같은 경로를 재사용 (버전과 무관한 키 — 스팟 좌표 해시 등)
- `/api/health`가 Blob 한도 때문에 전체 503이 되는 건 과합니다. Blob은 경고로 두고 `ok`는 DB 기준으로 판단하는 쪽을 검토해 주세요

## A-3. 판단 확인 (작업 보고 ★ 항목)

- **칭다오 `regionCode` 미적용**: 동의합니다. A-1 해결 후 실제 응답으로 확인하겠습니다.
- **랜드마크 앵커가 풀 상위에 없으면 보장 안 됨**: A-1 해결 후 홍콩 d4에 빅토리아 피크가 없으면 랜드마크 질의 상위 순위를 알려드리겠습니다.
- **순서 규칙을 비용 페널티로 처리**: 동의합니다.

---

## 작업 보고 양식

```
작업 보고 — {지시서 제목}
PR: #번호 (병합됨/초안)
커밋: 해시

처리
| 지시서 항목 | 파일 | 무엇을 |

지시서와 다르게 한 것 ★
(없으면 "없음")

검증한 것 / 못한 것
한 것: …
못한 것: … (이유)

Cowork가 확인할 것
- …
```

---

## 처리 결과 (2026-10-20)

- A-1 원인(코드 근거): #323 이후 stale-while-rebuild 는 직전 버전을 내보내고 끝나며, 새 버전은 **워밍 크론(하루 지역 2개, 방문된 조합만)** 만 만들게 돼 있었다. 크론은 하루 한 번이라 홍콩 d4 요청마다 `path=stale-while-rebuild` 만 찍히고 Places 호출(text-pro 29→29)이 없었다. 지시서가 의심한 ① 응답 후 작업 끊김은 아니다(백그라운드 작업 자체가 없었다) — 다만 같은 증상이 나는 설계였다.
- A-1 수정: 직전 버전을 서빙한 요청이 응답을 보낸 뒤 `after()`(Next.js, Vercel 에선 waitUntil)로 새 버전을 한 번 만든다. 워밍과 같은 출처("warm", 오늘 상한의 50%)로 돌려 사용자 몫을 먹지 않고, 같은 조합은 10분에 한 번(`rebuild-lock:{key}` 행). 로그: `path=rebuild-start | rebuild-done spots=… dayCounts=[…] | rebuild-fail reason=… | rebuild-skip reason=lock`.
- A-1 강제 재생성: `?refresh=` 는 CRON_SECRET 이 필요해 Cowork 가 쓸 수 없다. 대신 배포 후 홍콩 d4 를 한 번 요청하면 응답은 v41(직전 캐시)이고, 요청 뒤 백그라운드에서 v42 가 만들어진다 — 이어서 다시 요청해 확인한다.
- A-2: Blob 고급 작업(put · list · copy)을 부르는 곳을 코드로 전수 확인 — `put` 은 후기 사진 업로드(`api/upload`) 한 곳, `list`/`del` 은 계정 삭제(`accountDeletion`) 한 곳뿐이다. 지도 이미지는 10/13 이후 Blob 을 쓰지 않고(`/api/content/course-map` 이 Static Maps PNG 를 CDN 캐시로 서빙, 레거시 `/api/blob/…` 는 302), 존재 확인용 `list` 도 없다. 대시보드의 1.9K 는 그 전환 이전에 쌓인 값으로 보이나 이 세션에서 확인할 수 없다. 코드 쪽 줄일 곳이 더 없어 변경 없음.
- A-2 `/api/health`: `ok` · HTTP 상태는 DB 기준으로, Blob 한도·오류는 `blob.status` 와 `warnings` 로만 알린다.
- A-3 동의 사항: 변경 없음.
- 참고: 같은 파일 묶음의 `AUTOPI2`(AutoPipeline 저장소 지시서)는 이 저장소 범위가 아니라 처리하지 않았다.
