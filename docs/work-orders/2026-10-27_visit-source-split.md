# 작업 지시서 — "사람 방문 218" 은 실제 사람이 아님 — 봇·내부 호출 분리

작성: 2026-10-27 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: /api/health courseBuild (10/27) + 동근님 확인("앱에서는 그만큼 안 보임")
**`TRADULE_2026-10-23_PR338_검증_빈코스61개.md` 와 같은 PR 로 묶어도 됨.**

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-27_visit-source-split.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 1. 실측

```
courseBuild  visitsHumanToday 218 · visitsBotToday 435 · syncBuildsToday 138
text-pro     today 277/276 (전부 source=user) · 월 3,116/4,500
```

사람 218회 중 **서로 다른 빈 코스 138개를 하루에 동기 빌드** — 실제 사용자 패턴이 아니라 목록 순회(크롤러) 패턴입니다. 지금 "사람" 에는 봇 목록에 없는 크롤러와 우리 쪽 서버 호출(AutoPipeline course-brief · Cowork 점검)이 섞여 있고, 이들이 Pro 하루 몫을 다 쓰고 있습니다.

## 2. 할 것

```
① 내부 호출 표시: AutoPipeline 은 User-Agent "TraduleAutoPipeline/1.x" 를 보냄(AutoPipeline 지시서 별도)
   → source=internal 로 집계 · 방문 기록/재생성 대상 아님 · 브리프는 지금처럼 제공(동기 빌드 허용)
② 봇 판정 보강 (내부 호출이 표시되면 일반 패턴도 안전)
   이름 목록 추가: Bytespider · PetalBot · Baiduspider · YandexBot · MJ12bot · DotBot · SeznamBot · Amazonbot ·
   meta-externalagent · OAI-SearchBot · PerplexityBot · CCBot · DataForSeoBot · BLEXBot · ImagesiftBot · Barkrowler
   + 일반 패턴 /(bot|crawler|spider|crawl|slurp|scraper|headless|python-requests|curl|wget|go-http-client|axios|node-fetch|undici)/i
   단 "TraduleAutoPipeline" 은 internal 로 먼저 분기
③ 사람 판정에 최소 조건: 브라우저 UA(Mozilla/…) + Accept-Language 존재 + 코스 페이지(HTML) 요청 — course-brief API 직접 호출은 사람으로 세지 않음(source=api)
④ 동기 빌드(직전 버전 없음)는 source=user(사람 판정 통과)일 때만. api/bot 은 캐시 없으면 503 (봇 규칙과 동일) — 단 internal 은 허용
⑤ /api/health courseBuild 에 visitsBySource { human, bot, internal, api } · topUserAgents(오늘 상위 10, UA 앞 60자) 추가
```

## 3. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| courseBuild.visitsBySource | human 이 크게 줄고 bot/api/internal 로 나뉨 |
| topUserAgents | 상위 UA 가 무엇인지 (Cowork 이 보고 봇 목록 추가 판단) |
| syncBuildsToday · text-pro user | 크게 감소 |

---

## 처리 결과

- 출처 4종(`classifyVisit`, `src/lib/botUserAgent.ts`): **internal**(UA 에 `TraduleAutoPipeline`, 가장 먼저 분기) → **bot**(이름 목록 + 일반 패턴) → **api**(공개 `course-brief` API 직접 호출, 또는 `Mozilla/` UA·Accept-Language 가 없는 요청) → **human**(브라우저 UA + Accept-Language + 코스 페이지/앱 화면 요청).
- ② 이름 목록에 Bytespider·PetalBot·Baiduspider·YandexBot·MJ12bot·DotBot·SeznamBot·Amazonbot·meta-externalagent·OAI-SearchBot·PerplexityBot·CCBot·DataForSeoBot·BLEXBot·ImagesiftBot·Barkrowler 를 두고(앞의 12개는 이미 있던 것 포함), 지시서의 일반 패턴(`bot|crawler|spider|crawl|slurp|scraper|headless|python-requests|curl|wget|go-http-client|axios|node-fetch|undici`)을 추가했다. 이 패턴은 부분일치라 `Cubot` 같은 폰 이름이 걸릴 수 있다. `Claude/3.x` 같은 브라우저 토큰은 걸리지 않는다.
- ③④ 방문 기록(`recordCourseVisit`)과 백그라운드 재생성은 human 만. `course-brief` API 는 더 이상 방문을 기록하지 않는다(사람 화면만 워밍 대상). bot·api 는 캐시(직전 버전 포함)가 있으면 그대로 주고 없으면 만들지 않고 503, internal 은 동기 빌드를 허용한다. 앱 화면이 여는 `course-open`·`course-map` 은 브라우저 UA + Accept-Language 면 human.
- ⑤ `courseBuild.visitsBySource { human, bot, internal, api }`, `courseBuild.topUserAgents`(오늘 상위 10, UA 앞 60자; 행은 이틀 뒤 워밍 크론이 정리). 기존 `visitsHumanToday/visitsBotToday` 는 그대로(각각 human·bot).
- 영향·주의: 공개 API 를 부르던 AutoPipeline 이 새 UA(`TraduleAutoPipeline/1.x`)를 보내기 전에는 `api` 로 분류돼, 캐시가 없는 코스는 503 이 된다(캐시가 있으면 그대로 받는다). AutoPipeline 쪽 UA 반영이 필요하다(별도 지시서).
- `COURSE_ALGO_VERSION` 은 올리지 않았다. #338 지시서(빈 코스 61개)와 같은 PR 이다.
