import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { useIsClient } from "./useIsClient";

function Probe() {
  return createElement("span", null, useIsClient() ? "client" : "server");
}

describe("useIsClient", () => {
  it("서버 렌더(및 하이드레이션 첫 렌더)에서는 false — 시간대에 따라 달라지는 화면을 그리지 않는다", () => {
    expect(renderToString(createElement(Probe))).toContain("server");
  });
});
