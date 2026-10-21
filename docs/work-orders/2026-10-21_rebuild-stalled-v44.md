# 작업 지시서 — 긴급: 새 버전(v44) 코스가 만들어지지 않음 — Google 호출 0 (재생성 멈춤)

작성: 2026-10-21 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `e1a2df4`(#335) 배포 후 Cowork 라이브 실측 (Cowork 내장 브라우저 + 동근님 Chrome 둘 다)

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-21_rebuild-stalled-v44.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 1. 실측

```
course-brief 오사카 3 (요청 → 40초 대기 → 재요청, 일반 Chrome UA 포함)
  2:고쿠라쿠바시 다리[기타] →transit59   ← #335 이전 결과 그대로 · landmarkRank 없음
/api/health maps
  text-pro  월 1,628 (10/21 오전 확인값과 동일 — 하루 가까이 증가 0) · today 0/261
            todayBySource { user:0, warm:0, rebuild:0 }
  text-search-all today 0/450 · routes today 0
```

**하루 가까이 Google 호출이 한 건도 없습니다.** 사용자 요청은 직전 버전을 받고, 백그라운드 재생성(after)·워밍 크론 어느 쪽도 새 버전을 만들지 않고 있습니다. #333 때와 같은 증상이 #334/#335 이후 다시 생긴 것으로 보입니다.

참고: Cowork 내장 브라우저 UA 에 `Claude/3.x` 가 들어 있어 #334 봇 판정(ClaudeBot)에 걸렸을 수 있음 — 그래서 일반 Chrome 에서도 확인했고 결과 동일.

## 2. 할 것

```
① 원인 확인 — 다음 중 무엇인지 로그로 특정해 보고
   a. 봇 판정이 과하게 넓음 (예: /claude/i · 빈 UA · Vercel 내부 요청 · "bot" 부분일치) → 모든 요청이 bot 으로 분류
   b. after() 재생성이 실행되지 않음 / rebuild-lock 행이 풀리지 않음(10분 TTL 확인)
   c. 워밍 크론이 "최근 26시간 사람 방문" 조합을 0 으로 봄 (봇 제외 이후 course-visit 기록이 안 쌓임)
   d. 버전 키 불일치로 새 버전 저장 실패 (rebuild-done 후 저장 에러)
② 봇 판정은 정확한 토큰만: Googlebot · Google-InspectionTool · bingbot · Yeti · Daumoa · DuckDuckBot · Applebot · facebookexternalhit · Twitterbot · kakaotalk-scrap · Slackbot · AhrefsBot · SemrushBot · GPTBot · ClaudeBot (단어 경계) — "Claude/" 같은 브라우저 토큰은 사람
③ 워밍 크론 대상이 0 이면 "사이트맵 상위 조합 N개"로 대체 (사람 방문 없을 때도 하루 몇 개는 새 버전이 되도록) — 페이싱 워밍 몫 안
④ /api/health 에 courseBuild { currentVersion, lastRebuildAt, lastRebuildKey, lastRebuildResult, staleServedToday, visitsHumanToday, visitsBotToday } 추가 — Cowork 이 원인을 바로 볼 수 있게
⑤ CRON_SECRET 없이 확인할 수 있게, /api/health 의 courseBuild 로 충분하도록 (secret 노출 금지)
```

## 3. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| course-brief 오사카 3 (요청 → 1~2분 → 재요청) | 새 버전 · transit59 없음 · 다리 "관광지" · landmarkRank |
| /api/health courseBuild | lastRebuildAt 최근 · result ok · visitsHumanToday > 0 |
| text-pro todayBySource | rebuild/warm 증가 |

---

## 처리 결과

- 로그(Vercel)에 접근할 수 없어 **원인(a~d)은 코드만으로 특정하지 못했다.** 대신 다음 배포 후 `/api/health` 의 `courseBuild` 로 원인이 바로 갈리도록 계측을 넣었다.
  - a. 봇 판정: 정규식을 단어 경계 정확 토큰으로 교체(Googlebot·Google-InspectionTool·bingbot·Yeti·Daumoa·DuckDuckBot·Applebot·facebookexternalhit·Twitterbot·kakaotalk-scrap·Slackbot·AhrefsBot·SemrushBot·GPTBot·ClaudeBot 등). `Claude/3.x`, 빈 UA, WhatsApp·daum 부분일치는 사람. (기존 정규식도 일반 Chrome 은 잡지 않았음을 테스트로 확인)
  - b/d. 재생성: `lastRebuildResult` = scheduled → started → ok(스팟 수) / fail(사유) / skipped-lock 기록. scheduled 만 있고 started 가 없으면 after() 미실행, started 에서 멈추면 중간 종료.
  - c. 워밍 크론: 방문 대상이 `WARM_DAILY_MAX` 미만이면 사이트맵(`course-sitemap:*`) 상위 조합으로 남은 지역 칸을 채움. 마지막 실행은 `lastWarmAt/lastWarmResult`.
- `/api/health` `courseBuild { currentVersion, lastRebuildAt, lastRebuildKey, lastRebuildResult, lastRebuildStartedAt, lastRebuildOkAt, lastWarmAt, lastWarmResult, staleServedToday, visitsHumanToday, visitsBotToday }` 추가 (secret 없음, ok/status 판정은 기존대로 DB만).
- 워밍 크론은 하루 1회(05:00 UTC)라 v44 배포(≈06:53 UTC) 이전 실행분은 새 버전을 만들지 못했다.
- 버전(`COURSE_ALGO_VERSION`)은 올리지 않음.
