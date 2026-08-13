"use client";

import type { FeatureEventName, FeatureEventSurface } from "@/lib/featureEvents";

// 익명 세션 ID를 localStorage에 보관해 기능 이벤트를 같은 방문 세션끼리
// 묶어 볼 수 있게 한다 (로그인 여부와 무관하게 항상 채워짐 — userId는
// 서버에서 세션이 있을 때만 별도로 붙는다). 30분 무활동 시 갱신은 업계
// 표준 세션 정의(GA 등)를 그대로 따른 것 — 로그인 세션이나 인증과는
// 무관한, 순수 "이 방문 흐름을 하나로 묶기 위한" 식별자다.
const STORAGE_KEY = "travel-feature-session-v1";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

interface StoredSession {
  id: string;
  lastActiveAt: number;
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const s = parsed as Record<string, unknown>;
    if (typeof s.id !== "string" || typeof s.lastActiveAt !== "number") return null;
    return { id: s.id, lastActiveAt: s.lastActiveAt };
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage 불가(프라이빗 모드, 용량 초과 등) — 세션 ID는 그냥
    // 매번 새로 발급되고 영속되지 않을 뿐, 계측 자체를 막을 이유는 아니다.
  }
}

/**
 * 현재 익명 세션 ID를 얻는다. 30분 넘게 비활동이었으면 새로 발급하고,
 * 아니면 마지막 활동 시각만 갱신해서 재사용한다.
 */
function getOrCreateSessionId(): string {
  const now = Date.now();
  const existing = readStoredSession();
  if (existing && now - existing.lastActiveAt < SESSION_TIMEOUT_MS) {
    writeStoredSession({ id: existing.id, lastActiveAt: now });
    return existing.id;
  }
  const id = crypto.randomUUID();
  writeStoredSession({ id, lastActiveAt: now });
  return id;
}

export type { FeatureEventName, FeatureEventSurface };

/**
 * 기능 사용 이벤트를 서버로 fire-and-forget 전송한다. 계측 실패가 실제
 * 기능 흐름을 막으면 안 되므로 에러는 전부 삼킨다 (VisitorPing과 같은
 * 태도). SSR에서 호출되면 안전하게 아무것도 하지 않는다.
 */
export function trackFeatureEvent(event: FeatureEventName, surface?: FeatureEventSurface, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const sessionId = getOrCreateSessionId();
    fetch("/api/track/feature-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, sessionId, surface, props }),
    }).catch(() => {});
  } catch {
    // getOrCreateSessionId/JSON 직렬화 실패 등 — 계측은 부가 기능이므로
    // 조용히 무시한다.
  }
}
