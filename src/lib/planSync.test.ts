import { beforeEach, describe, expect, it } from "vitest";
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
