import { describe, it, expect } from "vitest";
import { esimAffiliateLinks } from "./travelpayoutsEsim";

describe("esimAffiliateLinks", () => {
  it("builds both provider links with the shared marker/trs and per-provider campaign_id/p (작업지시서 2026-08-26 실측값)", () => {
    const links = esimAffiliateLinks("course_esim");
    expect(links).toHaveLength(2);

    const airalo = links.find((l) => l.key === "airalo")!;
    expect(airalo.url).toBe(
      "https://tp.media/r?campaign_id=541&marker=765548&p=8310&sub_id=course_esim&trs=563085&u=https%3A%2F%2Fwww.airalo.com%2F",
    );

    const yesim = links.find((l) => l.key === "yesim")!;
    expect(yesim.url).toBe(
      "https://tp.media/r?campaign_id=224&marker=765548&p=5998&sub_id=course_esim&trs=563085&u=https%3A%2F%2Fyesim.app%2F",
    );
  });

  it("URL-encodes the sub_id so a placement string with special characters can't break the query string", () => {
    const links = esimAffiliateLinks("a&b=c");
    for (const l of links) expect(l.url).toContain("sub_id=a%26b%3Dc");
  });
});
