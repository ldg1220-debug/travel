# 작업 지시서 — 워밍 하루 2회: GitHub Actions 예약 실행 (무료, Vercel 플랜 변경 없음)

작성: 2026-10-27 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: #339 보고 "결정이 필요한 것 — 하루 2회 워밍" · 동근님 원칙(무료 유지)

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-27_warm-twice-gh-actions.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 0-1. 결정

Vercel Hobby 크론(하루 1회 05:00 UTC)은 그대로 두고, **GitHub Actions 예약 워크플로**로 하루 1회 더(17:00 UTC) 같은 워밍 엔드포인트를 호출합니다. 비용 없음.

## 1. 할 것

```
① .github/workflows/warm-courses.yml
   on: schedule: - cron: "0 17 * * *"   + workflow_dispatch (수동 실행)
   job: curl -fsS -m 120 -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" https://www.tradule.co.kr/api/cron/warm-course-brief
        (엔드포인트가 쓰는 인증 방식 그대로 — Vercel 크론과 같은 헤더)
   실패해도 다음 날 재시도로 충분 — 재시도 루프 없음
② 워밍 라우트: 같은 날 두 번째 실행이면 남은 워밍 몫만 사용 (이미 그렇게 동작하면 확인만)
   courseBuild 에 lastWarmSource: "vercel-cron" | "gh-actions" 기록
③ 비밀값은 저장소에 쓰지 않음. 동근님이 GitHub 저장소 Settings → Secrets and variables → Actions 에 CRON_SECRET 등록 (Vercel 환경변수와 같은 값)
④ docs/GOOGLE_APIS.md 또는 운영 문서에 "워밍 2회(05·17 UTC)" 기록
```

## 2. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| GitHub Actions 수동 실행(workflow_dispatch) | 성공(200) |
| /api/health courseBuild.lastWarmSource | 17:00 UTC 이후 "gh-actions" |
| versionProgress.missing | 하루 두 번 감소 |

---

## 처리 결과

- ① `.github/workflows/warm-courses.yml`: 매일 17:00 UTC + `workflow_dispatch`. `curl -fsS -m 120` 로 Authorization Bearer(`secrets.CRON_SECRET`)와 `X-Warm-Source: gh-actions` 헤더를 보내 `https://www.tradule.co.kr/api/cron/warm-course-brief` 를 부른다. 재시도 루프 없음. 시크릿은 환경 변수로만 받고 저장소에는 쓰지 않았다.
- ② 확인: 워밍 호출은 `mapsBudget` 에서 warm+rebuild 사용분이 오늘 상한의 50% 안일 때만 돌고(#337), 대상도 매번 "아직 비어 있는/만료 임박" 조합만 새로 고르므로 두 번째 실행은 남은 몫·남은 대상만 쓴다(코드 변경 없음). `courseBuild.lastWarmSource` 추가: UA `vercel-cron/…` → `vercel-cron`, `X-Warm-Source: gh-actions` → `gh-actions`, 그 밖은 `manual`.
- ③ **동근님이 해야 할 일**: GitHub 저장소 Settings → Secrets and variables → Actions 에 `CRON_SECRET` 등록(Vercel 환경변수와 같은 값). 등록 전에는 Actions 실행이 401 로 실패한다.
- ④ `docs/GOOGLE_APIS.md` 에 "워밍 2회(05·17 UTC)" 기록.
