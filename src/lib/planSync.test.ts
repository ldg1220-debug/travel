import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncPlanToServer } from "./planSync";
import { useItineraryStore } from "@/store/itineraryStore";

// 작업지시서 2026-09-16 "계획 덮어쓰기가 재발했습니다" §3-② — 저장하려는
// items의 출처를 클라이언트가 추적할 방법이 없으므로, "지금 남의 계획/
// 콘텐츠를 보고 있다"(viewerModeActive)는 사실 하나로 모든 저장/공유
// 호출의 공통 관문인 이 함수를 막는다. 모든 호출부(자동 저장, 카카오톡
// 공유, 초대하기, 계획 저장)가 결국 이 함수를 거치므로, 여기 하나만
// 확인하면 전체 경로가 막혀 있는지 알 수 있다.

describe("syncPlanToServer — viewer mode guard", () => {
  beforeEach(() => {
    useItineraryStore.setState({ viewerModeActive: false });
  });

  it("refuses to sync while viewer mode is active, without making a network call", async () => {
    useItineraryStore.setState({ viewerModeActive: true });
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("syncPlanToServer should never reach fetch while viewer mode is active");
    }) as typeof fetch;
    try {
      await expect(syncPlanToServer("plan-1", "domestic", [], "제목", undefined)).rejects.toThrow(/viewer mode/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(fetchCalled).toBe(false);
  });
});

// 작업지시서 2026-09-18 "뷰어 모드를 우회하는 저장 경로" §4/§5-②: 실측 —
// viewerModeActive(리액트 상태)가 공유/콘텐츠 링크 탭을 몇 분 열어두면
// 초기값으로 되돌아가는 게 확인됐다. window.location.pathname을 직접
// 읽는 두 번째 신호는 리액트 렌더 주기와 무관해 같은 방식으로 어긋날 수
// 없다 — remoteId가 있는(기존 행 덮어쓰기) 호출에만 적용된다(새 행을
// 만드는 게스트 이관 등은 하필 공유 링크 탭에서 로그인했다는 이유로
// 막히면 안 된다).
describe("syncPlanToServer — shared-view pathname guard", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    useItineraryStore.setState({ viewerModeActive: false });
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      // @ts-expect-error — node 환경엔 원래 window가 없다, 원상복구.
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  function stubPathname(pathname: string) {
    // @ts-expect-error — 테스트용 최소 stub, 실제 Window 타입 전체를 구현하지 않는다.
    globalThis.window = { location: { pathname } };
  }

  it("refuses to overwrite an existing plan (remoteId given) while on a shared plan view", async () => {
    stubPathname("/planner/76b80f1a-abcd");
    await expect(syncPlanToServer("plan-1", "domestic", [], "제목", 13)).rejects.toThrow(/shared plan view/i);
  });

  it("does not block creating a new plan (no remoteId) from a shared plan view", async () => {
    stubPathname("/planner/76b80f1a-abcd");
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ id: 1, shareToken: "x" }), { status: 200 });
    }) as typeof fetch;
    try {
      await syncPlanToServer("plan-2", "domestic", [], "제목", undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(fetchCalled).toBe(true);
  });

  it("does not block a normal update while on the user's own planner workspace", async () => {
    stubPathname("/planner");
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ id: 13, shareToken: "x" }), { status: 200 });
    }) as typeof fetch;
    try {
      await syncPlanToServer("plan-3", "domestic", [], "제목", 13);
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(fetchCalled).toBe(true);
  });
});
