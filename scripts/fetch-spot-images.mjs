#!/usr/bin/env node
// 작업지시서 2026-11-22 — 고정 카드(큐레이션 스팟·지역 타일) 이미지를 Wikimedia Commons 에서 찾는다.
// 사용: node scripts/fetch-spot-images.mjs "<id>=<Commons 검색어>" ...
// 출력: id 별 상위 후보(파일명·라이선스·저작자·썸네일 URL). 사람이 고른 뒤 src/data/spotImages.ts 에 옮긴다.
const API = "https://commons.wikimedia.org/w/api.php";
const strip = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const emit = process.argv.includes("--emit");
const out = [];
for (const arg of process.argv.slice(2).filter((a) => a !== "--emit")) {
  const [id, ...rest] = arg.split("=");
  const q = rest.join("=");
  const url = `${API}?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=4&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640`;
  let data;
  for (let attempt = 0; attempt < 5 && !data; attempt++) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // Commons 는 연속 호출을 제한한다
    const res = await fetch(url, { headers: { "User-Agent": "travel-spot-image-script/1.0 (internal)" } });
    try { data = await res.json(); } catch { /* rate limited — retry */ }
  }
  if (!data) { console.error(`FAILED ${id}`); continue; }
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  if (emit) {
    const p0 = pages.find((p) => p.imageinfo?.[0]?.thumburl && /^(CC0|CC BY|Public domain)/i.test(strip(p.imageinfo[0].extmetadata?.LicenseShortName?.value)));
    if (p0) {
      const ii = p0.imageinfo[0], m = ii.extmetadata;
      out.push({ id, url: ii.thumburl.split("?")[0], title: p0.title.replace(/^File:/, ""), author: strip(m.Artist?.value).slice(0, 60), license: strip(m.LicenseShortName?.value), page: ii.descriptionurl });
    } else console.error(`NO MATCH ${id} ${q}`);
    continue;
  }
  console.log(`## ${id} (${q})`);
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    const m = ii?.extmetadata ?? {};
    console.log(JSON.stringify({ title: p.title, license: strip(m.LicenseShortName?.value), author: strip(m.Artist?.value).slice(0, 60), thumb: ii?.thumburl, page: ii?.descriptionurl }));
  }
}
if (emit) console.log(JSON.stringify(out, null, 1));
