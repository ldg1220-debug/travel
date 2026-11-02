# 작업 지시서 — PR #350 검증: Klook 도시 ID 3곳 추가 · 네이버 링크 rel 정리

작성: 2026-11-02 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: Cowork 라이브 확인 (코스 페이지 HTML) + Klook 사이트에서 도시 ID 확인

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-11-02_pr350-klook-city-ids.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 1. 된 것

```
/course/오사카/2박3일  "Klook에서 숙소 보기" → tp.media · marker 765548 · trs 563085 · campaign_id 137 · p 4110 · sub_id 있음
                       u = klook.com/ko/destination/c29-osaka/3-hotel/ ✅ · rel sponsored nofollow · 제휴 고지 ✅
/course/경주/2박3일    Klook → /ko/hotels/ (폴백) · 네이버 보조 링크 ✅
```

## 2. 할 것

```
① KLOOK_CITY_IDS 추가 (Klook 사이트에서 확인한 도시 숙소 페이지):
   후쿠오카  c5209-fukuoka     https://www.klook.com/ko/destination/c5209-fukuoka/3-hotel/
   제주      c20544-jeju       https://www.klook.com/ko/destination/c20544-jeju/3-hotel/   (페이지 열림 확인)
   경주      c8928-gyeongju    https://www.klook.com/ko/destination/c8928-gyeongju/3-hotel/
   (참고: 서귀포 c25723-seogwipo — 제주 하위 지역이 따로 쓰이면)
② 네이버 링크는 제휴가 아니므로 rel 에서 sponsored 제거 → rel="nofollow noreferrer"
```

## 3. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| 경주·제주·후쿠오카 코스 페이지 | u= 가 각 도시 3-hotel 페이지 |
| 네이버 링크 | rel 에 sponsored 없음 |

---

## 처리 결과

- ① `KLOOK_CITY_IDS` 에 후쿠오카 `c5209-fukuoka` · 제주 `c20544-jeju` · 경주 `c8928-gyeongju` 추가(총 12개 도시). 이 도시들은 이제 `https://www.klook.com/ko/destination/{cityId}/3-hotel/` 로 간다. 서귀포(`c25723-seogwipo`)는 제주 하위 지역이 따로 쓰일 때를 위한 참고라서 넣지 않았다 — 앱에서 도시 이름이 "서귀포"로 오는 경로가 없다. 필요해지면 매핑만 더하면 된다. 매핑에 없는 도시는 계속 공통 `/ko/hotels/` 이다.
- ② 제휴가 아닌 링크(네이버)의 `rel` 을 `nofollow noreferrer` 로 — 코스 페이지(`LodgingAffiliateLinks`)와 계획 화면 숙소 시트(`PlannerBoard`) 둘 다 `isAffiliate` 일 때만 `sponsored` 를 단다.
- `COURSE_ALGO_VERSION` 은 올리지 않았다.
