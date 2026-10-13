# [트레쥴] 작업지시서 — Search Console "리뷰 스니펫" 심각 오류

- 저장소: `ldg1220-debug/travel`
- 실측: 2026-10-13, 운영 배포본
- 출처: Search Console 메일 — "`<parent_node>` 입력란의 개체 유형이 잘못되었습니다" (심각)

---

## 1. 원인 — 코스 상세 페이지의 JSON-LD

`/course/{지역}/{일수}` 페이지에 JSON-LD가 3개 있고, 그중 두 곳에 이 구조가 들어 있습니다.

```json
{ "@type": "ListItem", "position": 1,
  "item": {
    "@type": "TouristAttraction",
    "name": "동궁과 월지",
    "aggregateRating": { "@type": "AggregateRating", "ratingValue": 4.5, "reviewCount": 20824 }
  }
}
```

- 단독 `ItemList` 블록
- `TouristTrip.itinerary` 안의 같은 `ItemList` (같은 내용이 두 번 들어감)

**`aggregateRating`이 `TouristAttraction` 안에 있는 게 오류 원인입니다.** Google 리뷰 스니펫이 지원하는 상위 유형(Product, Recipe, LocalBusiness, Event, Book 등)에 `TouristAttraction`이 없습니다. 그래서 Google이 "상위 노드 유형이 잘못됐다"고 판정합니다. 사이트맵에 코스 상세 페이지가 81개 들어가 있으니 81개 전부 해당합니다.

다른 페이지는 문제없습니다.

| 페이지 | JSON-LD | 판정 |
|---|---|---|
| `/` | WebSite + Organization | ✅ |
| `/course/all` | CollectionPage + ItemList (URL·이름만) | ✅ |
| `/course/경주` | ItemList + BreadcrumbList | ✅ |
| `/course/경주/2박3일` | ItemList(평점 포함) + TouristTrip(평점 포함) + BreadcrumbList | ❌ |
| `/trip/7` | 없음 | — |

---

## 2. 수정 — `aggregateRating`을 JSON-LD에서 빼 주세요

### ⚠️ 상위 유형을 `LocalBusiness`로 바꿔서 해결하면 안 됩니다

오류만 보면 지원 유형으로 바꾸면 사라집니다. 하지만 이 평점은 **Google Places에서 가져온 남의 평점**입니다. Google 리뷰 스니펫 지침에는 이런 규정이 있습니다.

- 평점은 **사용자에게서 직접** 수집한 것이어야 한다
- **다른 사이트의 평점·리뷰를 모아서** 마크업하지 말 것

유형만 바꾸면 오류 메일은 멈추지만 **지침 위반**이 되고, 수동 조치(검색 노출 제한)를 받을 수 있습니다. 지금보다 나빠집니다.

### 해야 할 것

```
1. 코스 상세 JSON-LD 의 모든 TouristAttraction 에서 aggregateRating 제거
2. 단독 ItemList 블록 제거 — TouristTrip.itinerary 에 같은 내용이 이미 있음
3. TouristTrip + BreadcrumbList 는 유지
```

**화면에 보이는 평점(★4.5 · 리뷰 20,824)은 그대로 둬도 됩니다.** 문제는 구조화된 데이터로 Google에 "이 페이지의 평점"이라고 주장하는 부분뿐입니다. 화면 표기에는 Google 출처 표시가 붙어 있는지만 확인해 주세요(Places 약관).

### 넣어도 되는 것 (선택)

`TouristAttraction`에 평점 대신 이런 필드는 넣어도 됩니다.

```
name, geo(위도·경도), address, url
```

참고로 `TouristTrip`은 Google 리치 결과 대상이 아닙니다. 별점 같은 표시는 어떻게 해도 안 나오니, 구조화된 데이터는 **오류 없이 페이지 내용을 설명하는 수준**이면 충분합니다.

---

## 3. 수정 후 확인

- `/course/경주/2박3일` 페이지 소스에 `aggregateRating` 문자열이 0개
- JSON-LD 블록 2개 (TouristTrip, BreadcrumbList)
- 테스트 하나 추가: 코스 상세 JSON-LD에 `aggregateRating`이 없는지 확인하는 테스트 (다시 들어가는 걸 막는 용도)

배포 후 제가 사이트맵의 코스 상세 페이지를 몇 개 골라 확인하고, 동근님께 Search Console 수정 확인 요청을 드리겠습니다.

---

## 4. 같은 페이지의 별건 (이전 지시서 미처리분)

이번에 JSON-LD를 보다가 다시 확인됐습니다.

```
{ "@type": "TouristAttraction", "name": "경주 용황 광 옛날통닭 치킨 맥주 호프 저녁 야식" }
```

검색어를 이어 붙인 상호명이 **공개 페이지와 구조화된 데이터 양쪽에** 그대로 나갑니다. 이전 지시서의 "키워드 나열형 상호명 정제" 항목입니다. 같은 PR에서 처리해 주시면 좋습니다.

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

## 처리 결과

- §2 `buildCourseItemListJsonLd`: `aggregateRating` 제거(유형을 LocalBusiness 로 바꾸지 않음 — Google Places 평점은 리뷰 스니펫 지침 위반). 대신 `geo`(GeoCoordinates)만 싣는다. 화면의 평점 표기는 그대로.
- 코스 상세 페이지의 단독 `ItemList` 블록 제거 → JSON-LD 는 TouristTrip(itinerary 에 같은 ItemList) + BreadcrumbList 2개.
- 테스트: JSON-LD 빌더·실제 페이지 렌더에 aggregateRating 문자열 0개, 블록 2개(TouristTrip · BreadcrumbList), 화면 평점 유지.
- §4 `cleanDisplayName` → `stripKeywordStuffing`: 이름 끝에 일반 검색어(치킨·맥주·호프·저녁·야식·맛집·추천·가성비 …)가 3개 이상 연달아 붙으면 꼬리를 뗌("경주 용황 광 옛날통닭 치킨 맥주 호프 저녁 야식" → "경주 용황 광 옛날통닭"). 앞부분이 2토큰 아래로 줄면 원래 이름. 원래 이름은 `originalName` 으로 보존. 이전 지시서 원문이 없어 규칙은 이 사례로 설계(추정).
- `COURSE_ALGO_VERSION` 은 40 유지: 캐시된 브리프는 26시간 안에 재생성되며 그때 새 이름 규칙이 적용된다.
