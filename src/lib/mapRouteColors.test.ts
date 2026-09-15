import { describe, expect, it } from "vitest";
import { ROUTE_LEG_COLORS_HEX, routeLegColorHex, routeLegColorStaticParam } from "./mapRouteColors";

describe("routeLegColorHex — 작업지시서 2026-09-15 '공유 품질 4건' §3", () => {
  it("returns the first palette color for index 0", () => {
    expect(routeLegColorHex(0)).toBe(ROUTE_LEG_COLORS_HEX[0]);
  });

  it("cycles back to the start once the index exceeds the palette length", () => {
    expect(routeLegColorHex(ROUTE_LEG_COLORS_HEX.length)).toBe(ROUTE_LEG_COLORS_HEX[0]);
    expect(routeLegColorHex(ROUTE_LEG_COLORS_HEX.length + 2)).toBe(ROUTE_LEG_COLORS_HEX[2]);
  });

  it("gives a different color for each of the first N indices (no accidental duplicates within one palette pass)", () => {
    const colors = ROUTE_LEG_COLORS_HEX.map((_, i) => routeLegColorHex(i));
    expect(new Set(colors).size).toBe(ROUTE_LEG_COLORS_HEX.length);
  });
});

describe("routeLegColorStaticParam — Static Maps color: 파라미터 형식", () => {
  it("converts the first palette color to the 0xRRGGBBAA form used by course-brief", () => {
    expect(routeLegColorStaticParam(0)).toBe(`0x${ROUTE_LEG_COLORS_HEX[0].slice(1)}cc`);
  });

  it("cycles the same as routeLegColorHex", () => {
    expect(routeLegColorStaticParam(ROUTE_LEG_COLORS_HEX.length + 1)).toBe(routeLegColorStaticParam(1));
  });
});
