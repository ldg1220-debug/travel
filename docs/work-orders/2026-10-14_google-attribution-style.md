# 작업 지시서 — #317 검증: Google Maps 출처 표시를 정책 스타일에 맞춤

작성: 2026-10-14 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: `6a54df8`(#317) 라이브 실측 + Places API 정책 원문(Cowork 확인, 2026-10-08 갱신본)
정책: https://developers.google.com/maps/documentation/places/web-service/policies#google-maps-attribution-requirements

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-14_google-attribution-style.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 0-1. 배경

#317 에서 코스 페이지 등에 "평점·리뷰 정보 제공: Google Maps" 한 줄을 넣었습니다. Cowork 이 정책 원문을 확인했습니다 — 지도 없이 Places 내용을 보여줄 때는 **Google Maps 로고**가 원칙이고, 공간이 부족하면 **텍스트 "Google Maps"** 도 허용됩니다. 텍스트 방식은 스타일 요구가 있습니다.

## 1. 라이브 실측 (/course/경주/2박3일)

```
<p> 평점·리뷰 정보 제공: Google Maps
font Geist · 11px · weight 400 · color lab(65.5 …) (연회색) · white-space normal · translate 속성 없음
```

## 2. 정책 요구 vs 현재

| 항목 | 정책 | 현재 | 조치 |
|---|---|---|---|
| 글자 크기 | 12~16px | **11px** | 12px 이상 |
| 색 | #1F1F1F 또는 #5E5E5E(또는 흰색), 대비 4.5:1 | 연회색 | `#5E5E5E` |
| 줄바꿈 | "Google Maps" 가 두 줄로 나뉘면 안 됨 | normal | `white-space: nowrap` (Google Maps 부분) |
| 번역 방지 | `translate="no"` | 없음 | 추가 |
| 글꼴 | Roboto, 없으면 제품 sans-serif · weight 400 | Geist 400 | 그대로 OK |
| 표기 | "Google Maps" (대소문자·번역 변경 금지) | OK | — |
| 위치 | 해당 콘텐츠와 같은 컨테이너의 위/아래 | 목록 아래 | OK |

## 3. 할 것

```
GoogleAttribution.tsx
  <p className="…">평점·리뷰 정보 제공: <span translate="no" class="gmp-attribution">Google Maps</span></p>
  .gmp-attribution { font-family: Roboto, var(--font-sans), sans-serif; font-weight:400; font-size:12px(이상);
                     letter-spacing:normal; white-space:nowrap; color:#5E5E5E }
  문장 전체도 12px 이상 · #5E5E5E 로 맞추면 간단
/discover 기존 "평점·리뷰 정보 제공: Google" → 같은 컴포넌트로 교체 ("Google Maps" 로 통일)
CourseClient 카드 아래도 같은 컴포넌트
(선택) 공간 여유 있는 코스 상세는 공식 로고(Google_Maps_Attribution_Assets.zip, 높이 16~19px, aria-label "Google Maps") 로 — 텍스트만으로도 정책 위반은 아님
```

플래너 지도 위 팝업을 그대로 둔 판단은 맞습니다(정책: Google 지도 위에 표시되면 추가 출처 불필요).

## 4. 순서 · 버전

극소 작업 1건. `COURSE_ALGO_VERSION` 올리지 않음.

## 5. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| /course/경주/2박3일 | "Google Maps" span · translate="no" · 12px 이상 · #5E5E5E · nowrap |
| /discover | 같은 컴포넌트 · "Google Maps" |

---

## 처리 결과

- `GoogleAttribution`: 문장 12px · `#5E5E5E`(다크 모드는 흰색 — 정책 허용), "Google Maps" 는 `<span translate="no" class="gmp-attribution">` + `whitespace-nowrap` + `font-family: Roboto, var(--font-sans), sans-serif` + weight 400 + `letter-spacing: normal`.
- /discover 의 기존 인라인 "평점·리뷰 정보 제공: Google" 을 이 공용 컴포넌트로 교체("Google Maps" 로 통일), CourseClient 카드 아래·코스 상세도 같은 컴포넌트.
- 선택 사항(공식 로고)은 로고 에셋(zip)이 저장소에 없어 하지 않음 — 텍스트 방식으로 정책 충족.
- 다크 모드의 흰색 텍스트는 정책의 "흰색 허용"을 따른 것(밝은 배경은 #5E5E5E). `COURSE_ALGO_VERSION` 은 올리지 않음.
