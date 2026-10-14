import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// 작업지시서 2026-10-14 "Google API 사용처 문서화" §1④ — Google API 호출 지점이 docs/GOOGLE_APIS.md 에 빠지지 않게 CI 에서 막는다.
// src 아래에서 Places(New)/Directions/Static Maps 를 부르는 파일은 문서(표 B)에 파일 경로가 있어야 하고, 쓰는 환경 변수 이름도 문서에 있어야 한다.
const ROOT = join(__dirname, "..", "..");
const doc = readFileSync(join(ROOT, "docs", "GOOGLE_APIS.md"), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const CALL = /places\.googleapis\.com\/v1|maps\.googleapis\.com\/maps\/api\/(directions|staticmap|js)/;
const files = walk(join(ROOT, "src")).filter((f) => CALL.test(readFileSync(f, "utf8")));

describe("docs/GOOGLE_APIS.md", () => {
  it("Google API 를 부르는 파일이 하나 이상 있다(탐색이 깨지지 않았다)", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(files.map((f) => [relative(ROOT, f).replace(/\\/g, "/")]))("%s 가 표 B 에 있다", (rel) => {
    // 문서는 src/ 접두를 떼고 적는다(예: lib/server/courseRecommend.ts)
    const short = rel.replace(/^src\//, "");
    expect(doc, `docs/GOOGLE_APIS.md 에 ${short} 를 추가하세요`).toContain(short);
  });

  it("키 환경 변수 이름이 문서에 있고 키 값 같은 문자열은 없다", () => {
    for (const name of ["GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_SERVER_KEY", "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"]) expect(doc).toContain(name);
    expect(doc).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  });
});
