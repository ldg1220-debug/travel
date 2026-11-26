import { describe, expect, it, vi } from "vitest";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const track = vi.fn();
vi.mock("@/lib/trackFeatureEvent", () => ({ trackFeatureEvent: (...a: unknown[]) => track(...a) }));

import { TicketLink } from "./TicketLink";

// 작업지시서 2026-11-26 시인성 §1③ — 입장권 확인: 명암비 4.5:1 이상 주황 + 누르는 영역 44px
describe("TicketLink", () => {
  const props = { url: "https://klook.test/s?q=x", region: "오사카", spot: "유니버설" };
  it("href·rel 유지, 누르는 영역 min-h-11, 진한 주황 글씨", () => {
    const html = renderToStaticMarkup(createElement(TicketLink, props));
    expect(html).toContain('href="https://klook.test/s?q=x"');
    expect(html).toContain('rel="sponsored nofollow noopener noreferrer"');
    expect(html).toContain("min-h-11");
    expect(html).not.toContain("#ff5b00");
  });
  it("클릭하면 ticket_click 이벤트를 보낸다", () => {
    const el = TicketLink(props);
    expect(isValidElement(el)).toBe(true);
    (el as ReactElement<{ onClick: () => void }>).props.onClick();
    expect(track).toHaveBeenCalledWith("ticket_click", "course", { provider: "klook", region: "오사카", spot: "유니버설" });
  });
});
