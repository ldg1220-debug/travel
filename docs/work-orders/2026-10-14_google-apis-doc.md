# 작업 지시서 — Google API 사용처 문서화 (docs/GOOGLE_APIS.md)

작성: 2026-10-14 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: #320 가드 라이브 확인 + Cowork 의 Cloud 콘솔 프로젝트별 측정항목(30일)

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-10-14_google-apis-doc.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

## 0-1. 배경

Google API 가 두 프로젝트에 나뉘어 있습니다. 나중에 한 프로젝트로 모으거나 키를 바꿀 때 바로 보도록 사용처를 문서로 고정합니다. 동근님 PC 에도 같은 내용 사본(`GOOGLE_API_사용처.md`)이 있습니다.

```
Cloud 콘솔 30일 (9/14~10/14)
travel  (travel-501205)            Directions(legacy) 5,092 · 오류 848 · Maps Static 2,366 · Maps JS 56 · Places API(legacy) 7
TRAVEL  (splendid-flow-501212-p3)  Places API (New) 244 · 결제 계정 연결 · 콘솔 하루 상한 SearchText 100 · GetPlace 100 (10/14)
TRAVEL  (travel-501212) · bom Project   사용 없음
```

## 1. 할 것

```
① docs/GOOGLE_APIS.md 신규 — 아래 표 3개
   A. 프로젝트 ↔ API ↔ 환경 변수(키 이름) ↔ 콘솔 하루 상한
   B. 호출 지점(파일·함수) ↔ API ↔ SKU ↔ 쓰는 키(환경 변수) ↔ mapsBudget 상한 ↔ 한도 시 동작   (#320 §1 표 + 키 열)
   C. 프로젝트 통합 체크리스트 — 옮길 API 사용 설정 · 키 제한(HTTP 리퍼러/IP/API 제한) · Vercel 환경 변수 · 콘솔 상한 · 결제 계정
   키 값 자체는 절대 쓰지 말 것 (이름만)
② 코드로 확인해서 채울 것
   - 각 호출 지점이 읽는 환경 변수 이름, 브라우저용(NEXT_PUBLIC_…)과 서버용 구분
   - travel-501205 의 Places API(legacy) 7건 출처 (남아 있는 legacy 호출이 있으면 위치)
   - Directions 오류 848건(약 17%) 원인 추정 — 응답 status(ZERO_RESULTS · NOT_FOUND · OVER_QUERY_LIMIT 등) 분포를 로그로 남기기 [directions] status= 1줄
③ README 또는 docs 인덱스에서 GOOGLE_APIS.md 링크
④ 규칙: Google API 호출을 추가·변경하는 PR 은 이 문서도 같이 고친다 (PR 템플릿 체크박스 1줄)
```

## 2. 참고 — #320 가드 라이브 확인 (됨)

```
/api/health maps   text-enterprise · details-enterprise · photos 900/1000 · text-pro · details-pro 4500/5000 · static · routes 9000/10000 · count 모두 0
course-brief 도쿄 3   11곳 모두 평점 · 지도 있음
```

알아둘 점: 카운터는 배포 시점(10/14)부터 셉니다. 10월 1~13일 사용분은 빠져 있어 10월은 실제 사용량이 카운터보다 조금 많습니다(콘솔 30일 244건 수준이라 위험은 낮음). 11월부터는 정확합니다.

## 3. 배포 후 Cowork 이 확인할 것

| 항목 | 기대 |
|---|---|
| docs/GOOGLE_APIS.md | 표 A·B·C · 키 이름만 · legacy 7건과 Directions 오류 원인 기재 |

---

## 처리 결과

- ① `docs/GOOGLE_APIS.md` 신규: 표 A(프로젝트 ↔ API ↔ 환경 변수 ↔ 콘솔 상한), 표 B(호출 지점 ↔ API ↔ SKU ↔ 키 ↔ mapsBudget 상한 ↔ 한도 시 동작), 표 C(프로젝트 통합 체크리스트). 키 값은 없고 변수 이름만.
- ② 코드 확인: 각 호출 지점의 환경 변수(브라우저 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` / 서버 `GOOGLE_PLACES_API_KEY`(폴백으로 브라우저 키) · `GOOGLE_MAPS_SERVER_KEY`)를 표 B 에 기재. legacy Places 7건: 서버·스크립트·클라이언트 어디에도 legacy 호출 코드가 없어 브라우저 Maps JS(`libraries=places`·POI)가 내부적으로 부르는 것으로 **추정**(미검증). Directions 오류 848건: 원인 후보를 문서에 정리하고 `fetchGoogleDirectionsRoute` 가 호출마다 `[directions] status=… mode=…` 한 줄을 남기게 함(로그로 분포 확인 가능).
- ③ README 에 `docs/GOOGLE_APIS.md` 링크 추가.
- ④ `.github/pull_request_template.md` 신규(체크박스: Google API 호출을 추가·변경했다면 `docs/GOOGLE_APIS.md` 도 고쳤다) + `src/lib/googleApisDoc.test.ts`: Google API 를 부르는 src 파일이 문서에 없으면 CI 가 실패한다.
- 한계: 키 ↔ 프로젝트 연결과 콘솔 하루 상한(Directions·Static·Maps JS)은 Cloud 콘솔 확인이 필요(문서에 "확인 필요" 표기). `COURSE_ALGO_VERSION` 40 유지.
