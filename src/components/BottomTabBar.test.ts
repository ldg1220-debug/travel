import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 작업지시서 2026-11-26 시인성 — 하단 메뉴 비활성 글자 명암비(slate-400 2.63:1 → slate-500)
describe("BottomTabBar 비활성 글자색", () => {
  const src = readFileSync(new URL("./BottomTabBar.tsx", import.meta.url), "utf8");
  it("비활성은 text-slate-500, 연회색 slate-400 을 쓰지 않는다", () => {
    expect(src).toContain('"text-slate-500 dark:text-slate-500"');
    expect(src).not.toMatch(/(?<![:\w-])text-slate-400/);
  });
});
