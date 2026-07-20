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

// 설치앱(PWA) OS 팝업 알림 — 서버가 web-push로 보낸 payload를 그대로
// 띄운다({ title, body, url }, src/lib/server/push.ts 참고).
self.addEventListener("push", (event) => {
  let data = { title: "트레쥴", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // ignore malformed payloads
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/apple-icon.png",
      badge: "/apple-icon.png",
      data: { url: data.url },
    }),
  );
});

// 알림을 누르면 해당 화면으로 이동 — 이미 열려있는 탭이 있으면 그 탭을
// 포커스하고 이동시키고, 없으면 새 탭을 연다.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
