import { describe, expect, it } from "vitest";
import { dateWindow, formatTime, hourFromTime, minutesFromTime, pad2, rangesOverlap, shiftISODate } from "./timeline";

describe("pad2", () => {
  it("pads single digits with a leading zero", () => {
    expect(pad2(3)).toBe("03");
  });
  it("leaves two-digit numbers untouched", () => {
    expect(pad2(23)).toBe("23");
  });
});

describe("formatTime", () => {
  it("formats hour/minute as HH:mm", () => {
    expect(formatTime(9, 5)).toBe("09:05");
    expect(formatTime(23, 45)).toBe("23:45");
  });
});

describe("hourFromTime / minutesFromTime", () => {
  it("extracts the hour from an HH:mm string", () => {
    expect(hourFromTime("14:30")).toBe(14);
  });
  it("converts HH:mm to minutes since midnight", () => {
    expect(minutesFromTime("00:00")).toBe(0);
    expect(minutesFromTime("01:30")).toBe(90);
    expect(minutesFromTime("23:59")).toBe(1439);
  });
});

// Regression coverage for the back-to-back scheduling gap bug (P1 in
// docs/IMPROVEMENT_PLAN.md) — two blocks that share an exact boundary must
// NOT be reported as overlapping, only genuinely overlapping ranges should.
describe("rangesOverlap", () => {
  it("treats touching-but-not-overlapping ranges as non-overlapping", () => {
    expect(rangesOverlap(60, 60, 120, 60)).toBe(false); // 09:00-10:00 vs 10:00-11:00
  });
  it("detects a genuine overlap", () => {
    expect(rangesOverlap(60, 60, 90, 60)).toBe(true); // 09:00-10:00 vs 09:30-10:30
  });
  it("detects one range fully containing another", () => {
    expect(rangesOverlap(0, 120, 30, 15)).toBe(true);
  });
});

describe("shiftISODate", () => {
  it("shifts forward across a month boundary", () => {
    expect(shiftISODate("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("shifts backward across a year boundary", () => {
    expect(shiftISODate("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("handles a zero shift as a no-op", () => {
    expect(shiftISODate("2026-07-23", 0)).toBe("2026-07-23");
  });
});

describe("dateWindow", () => {
  it("returns `count` consecutive dates starting at `date`", () => {
    expect(dateWindow("2026-07-23", 3)).toEqual(["2026-07-23", "2026-07-24", "2026-07-25"]);
  });
});
