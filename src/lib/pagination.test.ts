import { describe, expect, it } from "vitest";
import { pageWindow } from "./pagination";

describe("pageWindow", () => {
  it("shows every page when there are 7 or fewer", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("collapses a long run into a single gap marker around the current page", () => {
    expect(pageWindow(5, 20)).toEqual([1, "gap", 4, 5, 6, "gap", 20]);
  });

  it("has no gap when the current page is near the start", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, "gap", 20]);
  });

  it("has no gap when the current page is near the end", () => {
    expect(pageWindow(20, 20)).toEqual([1, "gap", 19, 20]);
  });
});
