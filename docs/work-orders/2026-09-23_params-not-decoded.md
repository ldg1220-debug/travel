# 작업 지시서 — 404 원인 확정: params가 디코딩되지 않습니다

작성: 2026-09-23 · 대상: **트레쥴** (`ldg1220-debug/travel`)
근거: Vercel 런타임 로그 (동근님 제공)

---

## 0. 먼저 — 이 지시서를 저장소에 보관

1. `docs/work-orders/2026-09-23_params-not-decoded.md` 로 저장
2. **완료된** 지시서 중 오래된 것부터 지워 10개 유지 (미완료 건은 남길 것)
3. 본 작업과 **같은 PR에** 포함

---

## 1. ★★★ 로그가 답을 줬습니다

```
[course-page] gate rejected:
  region="%EA%B2%BD%EC%A3%BC"
  codePoints=[37,69,65,37,66,50,37,66,68,37,69,67,37,65,51,37,66,67]
  daysLabel="2%EB%B0%953%EC%9D%BC"
  parsedDays=null
```

**라우트는 실행됩니다.** 4라운드 동안 의심했던 "배포 산출물 누락"이 아닙니다.

```
params.region     = "%EA%B2%BD%EC%A3%BC"     ← 퍼센트 인코딩 문자열 그대로
codePoints[0]=37  = '%'                       ← 한글이 아니라 '%' 문자
params.days       = "2%EB%B0%953%EC%9D%BC"
parsedDays        = null                       ← "2박3일" 파싱 실패
```

**`params` 가 디코딩되지 않은 채로 들어옵니다.**

그래서:
```
"%EA%B2%BD%EC%A3%BC" === "경주"   →  false  →  gate rejected  →  notFound()
```

NFC 정규화를 아무리 해도 소용없습니다. **애초에 한글이 아닙니다.**
130ms 로 즉시 404였던 것도 설명됩니다 — 문자열 비교 한 번에 떨어집니다.

---

## 2. ★★★ 고칠 것

```js
const safeDecode = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

const region    = safeDecode(params.region).normalize("NFC");
const daysLabel = safeDecode(params.days);
```

```
· try/catch 필수 — 이미 디코딩된 값에 decodeURIComponent 를 쓰면
  '%' 가 섞인 문자열에서 URIError 가 납니다
· 디코딩 후에 NFC 정규화 (#266 의 정규화는 유지, 순서만 뒤로)
· generateMetadata 와 page 양쪽 모두 적용
```

**`generateMetadata` 는 지금 디코딩이 되고 있습니다.**
9/22 에 `<title>` 이 "경주 2박3일 코스 — 12곳, 총 19.8km" 로 정상 생성된 걸 확인했습니다.
**두 함수가 params 를 다르게 받고 있습니다.** 그 차이도 같이 확인해주세요.

---

## 3. ★★ 왜 이렇게 됐나

```
.next/server/chunks/[turbopack]_runtime.js
```

**Turbopack 빌드입니다.** App Router 의 params 디코딩 동작이 webpack 빌드와 다를 수 있습니다.
로컬 `next build` 와 Vercel 배포가 다른 번들러를 쓰고 있지 않은지 확인해주세요.

```
로컬에서 재현이 안 됐던 이유가 여기 있을 가능성이 큽니다.
```

**어느 쪽이든 §2 의 `safeDecode` 는 양쪽에서 안전합니다.** 먼저 적용하세요.

---

## 4. ★★ 테스트를 이렇게 바꾸세요

`vitest` 428개가 전부 통과하는데 프로덕션은 404였습니다.

```
지금 테스트:  page({ params: { region: "경주", days: "2박3일" } })
실제 런타임:  page({ params: { region: "%EA%B2%BD%EC%A3%BC", days: "2%EB%B0%953%EC%9D%BC" } })
```

**테스트가 디코딩된 값을 직접 넣고 있습니다.** 그래서 영원히 통과합니다.

```
인코딩된 params 로도 200 이 나오는 테스트를 추가하세요.
  params: { region: encodeURIComponent("경주"), days: encodeURIComponent("2박3일") }
```

---

## 5. ★ 덤 — VAPID 키가 깨져 있습니다

같은 로그에 이게 있었습니다.

```
Invalid VAPID keys — push notifications disabled:
  Error: Vapid private key should be 32 bytes long when decoded.
```

**푸시 알림이 꺼져 있습니다.** 이번 건과 무관하지만 모르고 계셨을 수 있어 옮깁니다.
후기 작성 유도 알림을 쓰려면 이게 먼저 고쳐져야 합니다.

---

## 6. 순서

| | 작업 | 규모 |
|---|---|---|
| 1 | `safeDecode` + NFC (§2) | **소 · 최우선** |
| 2 | generateMetadata/page 차이 확인 (§2) | 소 |
| 3 | 인코딩 params 테스트 (§4) | 소 |
| 4 | 200 확인 후 `COURSE_PAGES_IN_SITEMAP=true` | 소 |
| 5 | VAPID 키 (§5) | 소 · 별건 |

---

## 7. 배포 후 Cowork이 확인할 것

| 항목 | 기대 |
|---|---|
| `/course/경주/2박3일` | **200** |
| sitemap 24개 전수 | 200 |
| HTML | 장소명·평점 포함, JS 꺼도 보임 |
| `/course/포천/2박3일` | 404 (목록에 없으므로 정상) — 응답이 구분되는지 |
| JSON-LD | ItemList 파싱됨 |

---

## 8. 처리 결과 (이 세션이 추가)

### §2 — `safeDecode` + NFC, 완료

`src/app/(app)/course/[region]/[days]/page.tsx`에 `normalizeParam` 헬퍼를
추가해 지시서와 동일한 순서(디코딩 → NFC 정규화)로 구현했다.
`generateMetadata`와 `CoursePage`(기본 export) 양쪽 모두 `raw.region`/`raw.days`를
받은 직후 이 헬퍼를 거치도록 통일했다. `decodeURIComponent`는 try/catch로
감싸 이미 디코딩된 값에 `%`가 섞여 있어도 `URIError`로 죽지 않고 원본을
그대로 쓰도록 했다.

### §2 — generateMetadata/page 차이, 원인 불명으로 남김

지시서가 지적한 "두 함수가 params를 다르게 받는" 현상의 근본 원인은
이번 세션에서 규명하지 못했다. 다만 `normalizeParam`을 두 호출부 모두에
독립적으로 적용했으므로, 그 차이의 원인이 무엇이든 결과에는 영향이 없다.
Turbopack vs webpack 빌드 차이(§3)는 이 세션에서 Vercel 빌드 설정에
접근할 수 없어 직접 확인하지 못했다 — Cowork 쪽에서 배포 설정을
확인해줄 것을 권장한다.

### §4 — 인코딩 params 테스트, 완료

`page.test.ts`에 `encodeURIComponent("경주")`/`encodeURIComponent("2박3일")`를
그대로 넣는 테스트와, NFD(자모 분해) 문자열을 넣는 테스트를 추가했다.
전자는 `getCourseBrief`가 디코딩된 값(`"경주", 3`)으로 호출됐는지까지
검증한다 — 인코딩된 문자열 그대로 게이트를 통과하려 했다면 애초에
호출되지 않았을 것이기 때문이다.

### §5 — VAPID 키, 이번 라운드에서는 다루지 않음

지시서 자체가 "이번 건과 무관"이라고 명시했고 우선순위표에서도
별건·소 규모로 분류했다. 이번 세션은 §1~§4(404 수정)에 집중했고
VAPID 키 문제는 코드 버그인지 환경변수(시크릿) 설정 문제인지조차
조사하지 않았다 — 별도 지시서로 다뤄야 한다.

### 검증한 것 / 못한 것

- 한 것: `npx tsc --noEmit`, 변경 파일 `eslint`, `npx vitest run`(445개 통과),
  `npx next build` 모두 로컬에서 통과 확인.
- 못한 것: 프로덕션에서 실제로 `/course/경주/2박3일`이 200을 반환하는지는
  이 세션에 배포/실행 환경 접근 권한이 없어 직접 확인할 수 없었다.
  §7 체크리스트는 Cowork가 배포 후 확인해야 한다.
