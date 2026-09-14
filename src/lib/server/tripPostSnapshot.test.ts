import { describe, expect, it } from "vitest";
import { shouldRefreshSnapshot } from "./tripPostSnapshot";

// 작업지시서 2026-09-14 "후기에 코스 스냅샷 저장 + 담아가기" §3 — "후기
// 작성 시점의 계획을 그대로 복사"가 핵심이라, 언제 스냅샷을 (다시) 찍고
// 언제 그대로 지켜야 하는지가 이 기능의 핵심 정책이다. DB 접근이 필요한
// computeCourseSnapshot 자체는 이 저장소의 다른 DB 헬퍼와 마찬가지로
// 단위 테스트하지 않고, 이 순수 정책 함수만 고정한다.

describe("shouldRefreshSnapshot", () => {
  it("refreshes when a plan is newly attached (oldItineraryId null → set)", () => {
    expect(shouldRefreshSnapshot(null, 5, false)).toBe(true);
  });

  it("refreshes when switching to a different plan", () => {
    expect(shouldRefreshSnapshot(5, 6, true)).toBe(true);
  });

  it("does NOT refresh when the same plan is re-saved and a snapshot already exists (원본 계획 수정 → 후기는 그대로)", () => {
    expect(shouldRefreshSnapshot(5, 5, true)).toBe(false);
  });

  it("refreshes when the same plan is re-saved but no snapshot exists yet (backfill for pre-migration rows)", () => {
    expect(shouldRefreshSnapshot(5, 5, false)).toBe(true);
  });

  it("never refreshes when detaching the plan (newItineraryId null)", () => {
    expect(shouldRefreshSnapshot(5, null, true)).toBe(false);
    expect(shouldRefreshSnapshot(null, null, false)).toBe(false);
  });
});
