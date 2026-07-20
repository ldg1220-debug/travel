"use client";

import { useEffect } from "react";

/**
 * 크롬의 PWA 설치 가능(installable) 판정은 등록된 서비스 워커를 요구한다 —
 * 이게 없으면 "앱 설치" 대신 일반 "다운로드"만 뜬다. public/sw.js는 오프라인
 * 캐싱 없이 요건만 충족시키는 최소 워커.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
