# 작업 지시서 — #333 검증: v42 적용됨 · Pro 하루 상한을 매일 다 씀(봇 방문 재빌드) · 순서 규칙 3건

작성: 2026-10-21 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `77d3c56`(#333) 배포 후 Cowork 라이브 실측 (10/21 오전)

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-21_bot-rebuild-order-rules.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 1. 된 것

```
/api/health 200 · ok true · warnings ["blob limit: … 403"]                      ✅ (A-2)
오사카3  1:오사카 성 → gogobebe → 구로몬 시장 → 신세카이 시장 → 쓰텐카쿠 / 2:도톤보리 … / 3:USJ + 해유관
         첫 스팟 명소 · 식당 연속 없음                                             ✅
홍콩4   스카이 테라스 428(피크 타워) 포함 · 1일차 카페 시작 없음                      ✅
```

## 2. ★★★ Pro 하루 상한을 매일 다 씀

```
text-pro  월 1,628/4,500 · 오늘 263/261 (상한 도달)   text-search-all 263/450
```

페이싱 덕에 월 한도는 지켜지지만, 매일 상한에 닿으면 그날 남은 요청은 직전 캐시/503 이 됩니다. 사람 방문은 많지 않은데 하루 260 이 나가는 건 **검색 로봇(Googlebot·Yeti 등)이 사이트맵 코스 126개를 돌며 재빌드를 일으키는 것**으로 추정합니다.

```
① 봇 요청은 재빌드·방문 기록을 하지 않음
   User-Agent: Googlebot · Google-InspectionTool · bingbot · Yeti(네이버) · Daum · DuckDuckBot · Applebot · facebookexternalhit · Twitterbot · kakaotalk-scrap · Slackbot · AhrefsBot · SemrushBot · GPTBot · ClaudeBot 등
   봇에게는 캐시(직전 버전 포함)가 있으면 그대로, 없으면 지금처럼 503 (404 금지)
   course-visit 기록·after() 재빌드·워밍 대상 선정에서 봇 제외
② 로그 [course-brief] source=bot|user 로 하루 분포를 남기고, 다음 보고에 하루 Pro 사용량을 bot/user/warm 별로 적어 주세요
```

## 3. ★★ 순서 규칙 (v42 실측)

```
홍콩4  1일차 첫 스팟 "심포니오브라이트(침사추이)" — 저녁 8시 쇼가 하루 맨 앞
       → 야간형(심포니 오브 라이트 · 야시장 · 야경 · night market · 루프탑 바)은 그날 마지막(또는 마지막 2개 안)
홍콩4  3일차 홍콩해양공원[테마파크] + Wan Chai Market + 스카이 테라스 428 — 종일시설 날에 다른 스팟
       → "홍콩해양공원 · 오션파크 · Ocean Park" 종일시설 사전에 추가 (#331 보고 §⑧ 반영 확인)
칭다오3 2일차 Kiwi Cafe[카페] → Qingdao Coffee Chayi Street[카페] 연속 — 하루 카페 최대 1
칭다오3 이름 중국어/영어(五四广场 · 劈柴院 · Signal Mountain Park) — 요청에 languageCode=ko 가 실리는지 로그로 확인, 실리는데도 이러면 Google 에 한글명이 없는 것이므로 그대로 둠(보고만)
```

`COURSE_ALGO_VERSION` 은 순서 규칙 수정으로 +1 하되, 재빌드는 사람 방문 + 워밍 몫 안에서만 (봇 제외 ① 이 먼저 들어가야 함).

## 4. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| /api/health text-pro | 하루 증가가 상한보다 충분히 낮음 (다음 날 비교) |
| 홍콩4 | 심포니 오브 라이트가 그날 끝 · 해양공원 날 단독 |
| 칭다오3 | 하루 카페 1 |

---

## 처리 결과 (2026-10-21)

- §2① 검색 로봇 제외: `lib/botUserAgent.ts`(이름 목록 — Googlebot · Google-InspectionTool · bingbot · Yeti · Daum · DuckDuckBot · Applebot · facebookexternalhit · Twitterbot · kakaotalk-scrap · Slackbot · AhrefsBot · SemrushBot · GPTBot · ClaudeBot 등. 일반 "bot" 부분 문자열은 쓰지 않아 AutoPipeline 같은 호출자는 걸리지 않는다). 코스 페이지 · course-brief · course-map · course-open 이 `requestSource: "bot"` 으로 넘기고, 로봇은 `course-visit` 기록 · `after()` 재생성을 하지 않으며(워밍 대상은 방문 기록에서 뽑으므로 자동 제외), 캐시(직전 버전 포함)가 있으면 그대로, 없으면 만들지 않고 503(`TransientApiFailureError`, 404 금지).
- §2② 로그 `[course-brief] source=bot|user|warm|rebuild`. 하루 Pro 사용량을 출처별로 센다 — 페이싱 SKU(text-pro · text-enterprise · details-enterprise)의 오늘 호출이 `maps-ops-day-src:{sku}:{source}:{PT 날짜}` 로 쌓이고 `/api/health` 의 `maps[sku].todayBySource` 에 나온다. 새 출처 `rebuild`(사용자 방문이 응답 뒤 일으킨 재생성)는 워밍과 같은 오늘 상한 50% 몫. 봇은 호출을 일으키지 않으므로 bot 항목은 없다(로그 분포로 센다).
- §3 야간형: `dayOrderViolations` 에 "야간형(야경 슬롯 · 심포니 오브 라이트 · 야시장 · 루프탑 · 라이트쇼)은 마지막 max(2, 야간 수)곳 안" 위반을 추가 — 순서 최적화가 위반 없는 순서를 우선(위반 1건 = 50km).
- §3 종일시설: 이름 사전은 #332 에서 이미 추가돼 있었다(해양공원 · 오션파크 · Ocean Park — "홍콩 해양 공원" 띄어쓰기 변형까지 이번에 포함). 시설 날의 **동반 2곳(시설과 5km 이내)** 은 기존 규칙(#293/#296)이라 바꾸지 않았다 — 해양공원에서 완차이·피크까지는 5km 안이라 동반으로 유효하다. "시설 날 단독"이 필요하면 별도 결정.
- §3 카페: `capCafesPerDay` 를 재배치·앵커·보충이 끝난 뒤(순서 계산 직전)와 라우팅 후 재균형에도 다시 건다(총량이 최소 아래로 내려가면 더 빼지 않음). 앞선 캡 뒤에 다른 날 카페가 옮겨 와 같은 날 카페가 둘이 되던 경로.
- §3 언어: `googleTop` 이 요청마다 `[courseRecommend] googleTop lang=ko type=… query=…` 로그를 남긴다. 요청에 `languageCode:"ko"` 는 이미 실렸고(#332 보고), 그래도 중국어/영어면 Google 에 한글명이 없는 것이므로 그대로 둔다.
- `COURSE_ALGO_VERSION` 42 → 43. 재생성은 방문(봇 제외) + 워밍 몫 안에서만.
