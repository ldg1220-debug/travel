import { beforeEach, describe, expect, it, vi } from "vitest";

const { reserve, rate } = vi.hoisted(() => ({
  reserve: vi.fn(async () => ({ allowed: true, count: 1, limit: 100 })),
  rate: vi.fn(async () => true),
}));
vi.mock("@/lib/server/mapsBudget", () => ({
  chooseGuardedMask: vi.fn(async () => ({ mask: "places.photos" })),
  photoScreenFromReferer: () => "other",
  reserveMapsOp: reserve,
  releaseMapsOp: vi.fn(async () => {}),
  runWithMapsRoute: (_r: string, fn: () => Promise<unknown>) => fn(),
  runWithPhotoScreen: (_s: string, fn: () => Promise<unknown>) => fn(),
  settleGuarded: vi.fn(async () => {}),
}));
vi.mock("@/lib/server/rateLimit", () => ({ checkRateLimit: rate }));

import { NextRequest } from "next/server";
import { GET } from "./route";

const fetchMock = vi.fn();

function req(q: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://example.test/api/discover/spot-photo?q=${encodeURIComponent(q)}`, { headers });
}
const own = { referer: "https://example.test/discover", "user-agent": "Mozilla/5.0" };

function googleOk(q: string) {
  fetchMock.mockImplementation(async (url: string) =>
    String(url).includes("searchText")
      ? new Response(JSON.stringify({ places: [{ photos: [{ name: `places/x/photos/${q}` }] }] }), { status: 200 })
      : new Response(JSON.stringify({ photoUri: "https://lh3.example/p.jpg" }), { status: 200 }),
  );
}

describe("/api/discover/spot-photo", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    fetchMock.mockReset();
    reserve.mockClear();
    rate.mockReset();
    rate.mockResolvedValue(true);
  });

  it("봇 UA·외부/없는 Referer 는 Google 호출 없이 404(no-store)", async () => {
    for (const h of [{ ...own, "user-agent": "Googlebot/2.1" }, { "user-agent": "Mozilla/5.0" }, { ...own, referer: "https://evil.test/" }]) {
      const res = await GET(req("아무문자열", h));
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });

  it("IP 상한 초과면 Google 호출 없이 404", async () => {
    rate.mockResolvedValue(false);
    const res = await GET(req("limit-q", own));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("같은 q 2회: Google/photos 카운트는 1번만", async () => {
    googleOk("memo-q");
    const a = await GET(req("memo-q", own));
    const b = await GET(req("memo-q", own));
    expect(a.status).toBe(307);
    expect(b.status).toBe(307);
    expect(fetchMock).toHaveBeenCalledTimes(2); // searchText 1 + media 1, 두 번째 요청은 0
    expect(reserve).toHaveBeenCalledTimes(1);
  });
});
