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

// 작업지시서 2026-10-16 §2-⑤ — 합성 id 항목의 placeId 를 상세 조회 결과로 한 번만 채운다.
describe("fillItemPlaceId", () => {
  const REAL = "ChIJ0123456789abcdefghijk";
  it("fills a synthetic placeId but never overwrites a real Google id", () => {
    useItineraryStore.setState({ items: [item("content-0-0"), { ...item("b"), placeId: REAL }] });
    useItineraryStore.getState().fillItemPlaceId("content-0-0", REAL);
    useItineraryStore.getState().fillItemPlaceId("b", "ChIJzzzzzzzzzzzzzzzzzzzzzz");
    const items = useItineraryStore.getState().items;
    expect(items.find((i) => i.id === "content-0-0")?.placeId).toBe(REAL);
    expect(items.find((i) => i.id === "b")?.placeId).toBe(REAL);
  });
});

// 작업지시서 2026-10-19 "담아간 계획의 상단 제목" §4② — 담아간 복사본이 현재 계획으로 전환된다.
describe("adoptRemotePlan", () => {
  const remote = { id: 9, title: "하노이 2박3일", region: "international" as const, placesData: [item("h1", "2026-10-24")], shareToken: "tok-new" };

  it("adds the copy as a saved plan, makes it the active plan, and leaves the previously open plan untouched", () => {
    const other = { id: "plan-old", name: "0711 오사카", savedAt: 1, items: [item("o1")], places: [], activeDate: "2026-07-11", currentCity: "오사카", region: "international" as const };
    useItineraryStore.setState({ savedPlans: [other], activePlanId: "plan-old", items: [item("o1")] });
    const id = useItineraryStore.getState().adoptRemotePlan(remote);
    const s = useItineraryStore.getState();
    expect(id).not.toBeNull();
    expect(s.activePlanId).toBe(id);
    expect(s.savedPlans.find((p) => p.id === id)?.name).toBe("하노이 2박3일");
    expect(s.savedPlans.find((p) => p.id === id)?.shareToken).toBe("tok-new");
    expect(s.savedPlans.find((p) => p.id === "plan-old")?.items.map((i) => i.id)).toEqual(["o1"]);
    expect(s.items.map((i) => i.id)).toEqual(["h1"]);
  });

  it("switches to the existing plan instead of duplicating when adopted twice", () => {
    const a = useItineraryStore.getState().adoptRemotePlan(remote);
    const b = useItineraryStore.getState().adoptRemotePlan(remote);
    expect(b).toBe(a);
    expect(useItineraryStore.getState().savedPlans.filter((p) => p.shareToken === "tok-new")).toHaveLength(1);
  });
});

// 작업지시서 2026-10-30 "저장된 계획 목록 · 0711 오사카가 하노이로 덮어쓰였는지" §1③ — 재현: 다른 계획("0711 오사카")이 열려 있는 채로 공유 화면에서 빌려온 내용을 보고
// 화면을 벗어나면, 뷰어 모드만 꺼지고 items 는 빌려온 내용 그대로여서 자동 저장(savePlanAs(name, activePlanId))이 그 내용을 오사카 계획에 덮어썼다.
describe("공유 화면을 벗어날 때 빌려온 내용이 내 계획으로 흘러가지 않는다 (leaveSharedView)", () => {
  const savedOsaka = () => {
    useItineraryStore.setState({ viewerModeActive: false, items: [item("osaka-1", "2026-07-11"), item("osaka-2", "2026-07-11")], currentCity: "오사카" });
    return useItineraryStore.getState().savePlanAs("0711 오사카")!;
  };

  it("재현(수정 전 동작): 뷰어 모드만 끄면 자동 저장이 빌려온 하노이 내용을 오사카 계획에 덮어쓴다", () => {
    const osakaId = savedOsaka();
    useItineraryStore.getState().setViewerModeActive(true, "하노이 여행 코스");
    useItineraryStore.setState({ items: [item("hanoi-1", "2026-10-24")] }); // 공유 화면이 items 를 빌려온 내용으로 바꾼다
    useItineraryStore.getState().setViewerModeActive(false); // 예전 정리 동작: 플래그만 끈다
    // AppBar 의 1.5초 뒤 자동 저장 = savePlanAs(name, activePlanId)
    useItineraryStore.getState().savePlanAs("0711 오사카", osakaId);
    expect(useItineraryStore.getState().savedPlans.find((p) => p.id === osakaId)?.items.map((i) => i.id)).toEqual(["hanoi-1"]); // 덮어써진다
  });

  it("수정 후: leaveSharedView 가 작업 상태를 열린 내 계획의 저장된 내용으로 되돌려, 자동 저장이 와도 오사카가 그대로다", () => {
    const osakaId = savedOsaka();
    useItineraryStore.getState().setViewerModeActive(true, "하노이 여행 코스");
    useItineraryStore.setState({ items: [item("hanoi-1", "2026-10-24")] });
    useItineraryStore.getState().leaveSharedView("hanoi-token");
    const s = useItineraryStore.getState();
    expect(s.viewerModeActive).toBe(false);
    expect(s.items.map((i) => i.id)).toEqual(["osaka-1", "osaka-2"]);
    expect(s.currentCity).toBe("오사카");
    useItineraryStore.getState().savePlanAs("0711 오사카", osakaId); // 자동 저장
    expect(useItineraryStore.getState().savedPlans.find((p) => p.id === osakaId)?.items.map((i) => i.id)).toEqual(["osaka-1", "osaka-2"]);
  });

  it("열린 계획이 없으면(초안만) 초안 내용으로, 초안도 없으면 빈 상태로 돌아간다", () => {
    useItineraryStore.setState({ viewerModeActive: true, items: [item("hanoi-1")], activePlanId: null, draft: null });
    useItineraryStore.getState().leaveSharedView("t");
    expect(useItineraryStore.getState().items).toEqual([]);
    useItineraryStore.setState({
      viewerModeActive: true,
      items: [item("hanoi-1")],
      draft: { id: "draft", name: "진행 중인 계획", savedAt: 1, items: [item("mine")], places: [], activeDate: "2026-09-16", currentCity: "서울", region: "domestic" },
    });
    useItineraryStore.getState().leaveSharedView("t");
    expect(useItineraryStore.getState().items.map((i) => i.id)).toEqual(["mine"]);
  });

  it("이 화면이 지금 열린 내 계획의 것이면(소유자) 되돌리지 않는다 — items 는 내 것", () => {
    const osakaId = savedOsaka();
    useItineraryStore.getState().setPlanRemoteInfo(osakaId, 7, "osaka-token");
    useItineraryStore.setState({ items: [item("osaka-1"), item("osaka-3-new")] }); // 방금 고친 내용(아직 자동 저장 전)
    useItineraryStore.getState().leaveSharedView("osaka-token");
    expect(useItineraryStore.getState().items.map((i) => i.id)).toEqual(["osaka-1", "osaka-3-new"]);
  });
});

describe("hydrateSavedPlansFromServer — 서버 시각을 저장된 계획에 싣는다", () => {
  it("updatedAt → savedAt(수정), createdAt → createdAt(만든 날)", () => {
    useItineraryStore.getState().hydrateSavedPlansFromServer([
      { id: 9, title: "하노이 여행 코스 (복사)", region: "international", placesData: [item("h1", "2026-10-24")], shareToken: "t9", createdAt: "2026-10-19T03:00:00.000Z", updatedAt: "2026-10-20T04:00:00.000Z" },
    ]);
    const plan = useItineraryStore.getState().savedPlans[0];
    expect(plan.savedAt).toBe(Date.parse("2026-10-20T04:00:00.000Z"));
    expect(plan.createdAt).toBe(Date.parse("2026-10-19T03:00:00.000Z"));
  });
});
