// PWA 설치 가능(installable) 판정용 최소 서비스 워커.
// 크롬은 등록된 서비스 워커(+ fetch 핸들러)가 없으면 "앱 설치" 대신 일반
// "다운로드"만 제공한다. 이 앱은 로그인 세션·개인화 데이터가 많아서 섣부른
// 오프라인 캐싱이 오히려 낡은 화면을 보여줄 위험이 크므로, 요건만 충족시키고
// 아무것도 가로채지 않는다.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // 브라우저 기본 네트워크 동작을 그대로 사용 — 아무것도 가로채지 않는다.
});
