import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { GoogleAttribution } from "./GoogleAttribution";

// 작업지시서 2026-10-14 "#317 검증" — Places 정책 텍스트 출처 표시 스타일.
describe("GoogleAttribution", () => {
  const html = renderToStaticMarkup(createElement(GoogleAttribution, { className: "mt-3" }));
  it('"Google Maps" 는 translate="no" · nowrap · Roboto · weight 400 인 span', () => {
    expect(html).toMatch(/<span[^>]*translate="no"[^>]*>Google Maps<\/span>/);
    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain("font-family:Roboto");
    expect(html).toContain("font-normal");
    expect(html).toContain("gmp-attribution");
  });
  it("문장은 12px 이상 · #5E5E5E(어두운 배경은 흰색)", () => {
    expect(html).toContain("text-[12px]");
    expect(html).toContain("text-[#5E5E5E]");
    expect(html).toContain("dark:text-white");
    expect(html).toContain("평점·리뷰 정보 제공:");
    expect(html).toContain("mt-3");
  });
});
