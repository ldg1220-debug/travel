import { beforeEach, describe, expect, it } from "vitest";
import { useItineraryStore } from "./itineraryStore";
import type { ItineraryItem } from "@/lib/types";

// 작업지시서 2026-09-16 "계획 덮어쓰기가 재발했습니다" §3-①/§3-② —
// production 실측: 공유 링크/course-open 콘텐츠를 열면 그 내용이
// activePlanId는 그대로 둔 채 items에 실렸고, 자동 저장·스위처가 그 상태를
// 구분 못 해 이전에 열려 있던 진짜 계획(또는 초안)의 서버 행을 덮어썼다.
// viewerModeActive는 정확히 그 순간("지금 보이는 게 내 것이 아니다")을
// 표시하는 플래그다 — savePlanAs/flushLiveState(loadPlan 등을 통해)가
// 이 플래그를 존중하는지 확인한다.

function item(id: string, date = "2026-09-16"): ItineraryItem {
  return { id, placeId: id, name: id, date, time: "09:00", durationMinutes: 60, coordinates: { lat: 1, lng: 1 } };
}

beforeEach(() => {
  useItineraryStore.setState({
    items: [],
    places: [],
    savedPlans: [],
    activePlanId: null,
    draft: null,
    viewerModeActive: false,
  });
});

describe("viewerModeActive 가드", () => {
  it("savePlanAs refuses to create a new plan while viewer mode is active", () => {
    useItineraryStore.setState({ viewerModeActive: true, items: [item("borrowed")] });
    const id = useItineraryStore.getState().savePlanAs("빌려온 계획");
    expect(id).toBeNull();
    expect(useItineraryStore.getState().savedPlans).toHaveLength(0);
  });

  it("savePlanAs refuses to overwrite an existing plan while viewer mode is active", () => {
    useItineraryStore.setState({ viewerModeActive: false, items: [item("original")] });
    const realId = useItineraryStore.getState().savePlanAs("내 진짜 계획")!;
    useItineraryStore.setState({ viewerModeActive: true, items: [item("borrowed")] });
    const result = useItineraryStore.getState().savePlanAs("아무 이름", realId);
    expect(result).toBeNull();
    const real = useItineraryStore.getState().savedPlans.find((p) => p.id === realId);
    expect(real?.items.map((i) => i.id)).toEqual(["original"]);
  });

  it("loadPlan does not let borrowed items leak into the previously-active plan's saved snapshot (flushLiveState no-ops in viewer mode)", () => {
    useItineraryStore.setState({ viewerModeActive: false, items: [item("original")] });
    const realId = useItineraryStore.getState().savePlanAs("내 진짜 계획")!;
    // activePlanId is still realId here — this is exactly the production bug's
    // state: someone opened a shared/content link without it being cleared.
    useItineraryStore.setState({ viewerModeActive: true, items: [item("borrowed")] });
    useItineraryStore.getState().loadPlan(realId);
    const real = useItineraryStore.getState().savedPlans.find((p) => p.id === realId);
    expect(real?.items.map((i) => i.id)).not.toContain("borrowed");
    expect(real?.items.map((i) => i.id)).toEqual(["original"]);
  });

  it("loadPlan turns viewer mode back off once a real plan is explicitly opened", () => {
    const realId = useItineraryStore.getState().savePlanAs("계획")!;
    useItineraryStore.setState({ viewerModeActive: true });
    useItineraryStore.getState().loadPlan(realId);
    expect(useItineraryStore.getState().viewerModeActive).toBe(false);
    expect(useItineraryStore.getState().activePlanId).toBe(realId);
  });

  it("openDraft and startNewPlan also clear viewer mode", () => {
    useItineraryStore.setState({ viewerModeActive: true });
    useItineraryStore.getState().openDraft();
    expect(useItineraryStore.getState().viewerModeActive).toBe(false);

    useItineraryStore.setState({ viewerModeActive: true });
    useItineraryStore.getState().startNewPlan();
    expect(useItineraryStore.getState().viewerModeActive).toBe(false);
  });

  it("outside viewer mode, switching plans still flushes unsaved edits into the plan being left (no regression)", () => {
    useItineraryStore.setState({ items: [item("a")] });
    const planAId = useItineraryStore.getState().savePlanAs("계획 A")!;
    const planBId = useItineraryStore.getState().savePlanAs("계획 B")!; // now active: B
    useItineraryStore.getState().loadPlan(planAId); // back to A
    useItineraryStore.setState({ items: [item("a-edited")] }); // unsaved live edit on A
    useItineraryStore.getState().loadPlan(planBId); // switch away from A to B
    const planA = useItineraryStore.getState().savedPlans.find((p) => p.id === planAId);
    expect(planA?.items.map((i) => i.id)).toEqual(["a-edited"]);
  });
});
