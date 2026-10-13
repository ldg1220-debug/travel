# [트레쥴] 작업지시서 — PR #316 후속: Google 출처 표시

- 저장소: `ldg1220-debug/travel`
- 실측: 2026-10-13, 운영 배포본 `a836885` (#316)

---

## PR #316 검증 결과 — 통과

| 페이지 | JSON-LD | aggregateRating |
|---|---|---|
| 경주/2박3일 | TouristTrip, BreadcrumbList | 0 |
| 오사카/2박3일 | TouristTrip, BreadcrumbList | 0 |
| 도쿄/3박4일 | TouristTrip, BreadcrumbList | 0 |
| 세부/3박4일 | TouristTrip, BreadcrumbList | 0 |
| 코타키나발루/5박7일 (Search Console 예시 페이지) | TouristTrip, BreadcrumbList | 0 |

화면 평점("평점 4.5(리뷰 20,824개)")은 그대로 남아 있습니다.

**Search Console "수정 결과 확인"을 눌렀고 상태가 "유효성 검사: 시작됨"으로 바뀌었습니다.** (잘못된 항목 258개, 유효 0개에서 시작) Google 재검사는 며칠~2주 걸립니다.

키워드 나열형 상호명 규칙(끝에 일반 검색어 3개 이상 연속이면 제거)은 그대로 좋습니다. 이전 지시서에도 특정 단어 목록은 없었습니다.

---

## A-1. 화면 평점에 Google 출처 표시가 없습니다

`/course/경주/2박3일` 본문 텍스트에서 "Google"·"구글"이 **0회**입니다.

```
동궁과 월지  명소/유적 · 평점 4.5(리뷰 20,824개)
```

이 평점·리뷰 수는 Google Places에서 가져온 값입니다. Google Maps Platform 정책상 **Google 지도 없이 Places 데이터를 보여줄 때는 Google 출처 표시가 필요합니다.** 지도 이미지가 페이지에 있더라도, 평점 목록은 지도와 떨어져 있어서 별도로 표시하는 게 안전합니다.

### 해 주실 것

- 평점이 보이는 목록(일차별 장소 목록) 근처에 Google 출처 표시를 한 곳 넣기
  - 가장 간단한 형태: 목록 하단에 "평점·리뷰 수: Google 지도" 같은 문구 또는 Google Maps 로고
  - 정확한 표기 형식은 [Places API 정책 페이지](https://developers.google.com/maps/documentation/places/web-service/policies)의 출처 표시 항목을 따라 주세요
- 같은 평점을 쓰는 다른 화면(앱 내 코스 결과, /discover 카드 등)도 같은 기준으로 확인

## A-2. 상호명 정리 반영 — 버전은 올리지 마세요

"경주 용황 광 옛날통닭 치킨 맥주 호프 저녁 야식"이 아직 그대로입니다. 캐시가 갱신되는 26시간 안에 바뀌는 게 정상이라 **COURSE_ALGO_VERSION은 올리지 않는 판단이 맞습니다.** (버전을 올리면 전체 캐시가 비고 Places 비용이 다시 나갑니다) 제가 내일 다시 확인하겠습니다.

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

- A-1 공용 `GoogleAttribution`(`src/components/GoogleAttribution.tsx`, "평점·리뷰 정보 제공: Google Maps")을 코스 상세 페이지의 일자별 장소 목록 아래와 앱 내 코스 선택 화면(CourseClient)의 장소 카드 격자 아래에 추가(평점이 있는 장소가 있을 때만). /discover 에는 같은 취지의 인라인 표기("평점·리뷰 정보 제공: Google")가 이미 있어 그대로 둠. 플래너 장소 상세·지도 팝업은 Google 지도 위에서 보이는 평점이라 이번에 건드리지 않음.
- 표기 형식은 Places API 정책 페이지 원문을 이 세션에서 확인하지 못했다(텍스트 "Google Maps" 표기로 구현) — 정책상 요구 형식(로고/글꼴/크기)과 맞는지는 확인 필요.
- A-2 상호명 정리: `COURSE_ALGO_VERSION` 올리지 않음(지시서와 같은 판단), 변경 없음.
