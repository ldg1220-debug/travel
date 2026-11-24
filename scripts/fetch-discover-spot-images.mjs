/**
 * /discover 큐레이션 스팟 고정 이미지 수집 (작업지시서 2026-11-24 #382 ③).
 *
 * 스팟 목록 → 위키미디어 공용(Commons) 검색 → 라이선스 확인 → 480px webp 저장 →
 * src/lib/discoverSpotImages.ts 갱신. API 키 불필요. Google 사진은 쓰지 않는다.
 *
 * 실행:  npx tsx scripts/fetch-discover-spot-images.mjs [--force] [id ...]
 *  - 이미 public/discover/spots/{id}.webp 가 있는 스팟은 건너뛴다(--force 로 재수집).
 *  - 허용 라이선스: CC0 · Public domain · CC BY · CC BY-SA (그 외·불명은 버린다).
 *  - 정확도를 위해 SEARCH_QUERIES 에 검색어가 있는 "실존 랜드마크"만 받는다.
 *    음식점·숙소·카페 등 특정 업소는 의도적으로 제외(아이콘 타일 유지).
 *  - 결과는 사람이 눈으로 확인한 뒤 커밋한다(잘못 매칭된 id 는 파일과 출처 항목을 지우면 된다).
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public/discover/spots");
const META_FILE = path.join(ROOT, "src/lib/discoverSpotImages.ts");
const WIDTH = 480;
const MAX_BYTES = 60 * 1024;
const UA = "travel-discover-image-fetch/1.0 (static curated images; contact via repo issues)";

/** id → Commons 검색어(영문 고유명사 위주). 여기 없는 스팟은 받지 않는다. */
const SEARCH_QUERIES = {
  "d-t8": "Jeonju Hanok Village",
  "d-t11": "Dongpirang Mural Village Tongyeong",
  "d-t12": "Gwangalli Beach Busan",
  "d-t13": "Songdo Central Park Incheon",
  "d-f1": "Gyeongbokgung Geunjeongjeon",
  "d-f2": "Seongsan Ilchulbong",
  "d-f4": "Gamcheon Culture Village",
  "d-f5": "Bulguksa temple",
  "d-f6": "Daereungwon Tumuli Park Gyeongju",
  "o-t1": "Dotonbori Glico sign",
  "o-t5": "Shibuya Crossing",
  "o-t6": "Fushimi Inari Taisha torii",
  "o-t9": "My Khe Beach Da Nang",
  "o-t12": "Ha Long Bay",
  "o-f1": "Osaka Castle",
  "o-f3": "Hoan Kiem Lake",
  "o-uk1": "Big Ben Elizabeth Tower Westminster",
  "o-uk2": "Buckingham Palace",
  "o-fr1": "Eiffel Tower",
  "o-fr2": "Louvre Museum pyramid",
  "o-fr3": "Montmartre Sacre-Coeur",
  "o-us1": "Times Square",
  "o-us2": "Central Park New York",
  "o-ca1": "Stanley Park Vancouver",
  "o-th1": "Wat Arun",
  "o-tw1": "Taipei 101",
  "o-it1": "Colosseum Rome",
  "o-it2": "Trevi Fountain",
  "o-es1": "Sagrada Familia",
  "o-es2": "Park Guell",
  "o-us4": "Golden Gate Bridge",
  // 제외(2026-11-24 육안 확인에서 대표성 부족): d-f7 o-f4 o-t11 o-us3 — 검색어를 구체화한 뒤 다시 추가할 것
  "o-us5": "Fisherman's Wharf San Francisco",
};

const ALLOWED = [
  [/^cc0|public domain|^pd\b|pdm/i, "CC0 / Public domain"],
  [/^cc[- ]by[- ]sa[- ]?([\d.]+)/i, (m) => `CC BY-SA ${m[1]}`],
  [/^cc[- ]by[- ]?([\d.]+)/i, (m) => `CC BY ${m[1]}`],
];

function normalizeLicense(short) {
  const s = (short ?? "").trim();
  if (/-(nc|nd)\b/i.test(s)) return null;
  for (const [re, out] of ALLOWED) {
    const m = s.match(re);
    if (m) return typeof out === "function" ? out(m) : out;
  }
  return null;
}

const stripHtml = (v) => String(v ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function politeFetch(url) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status !== 429 && res.status < 500) return res;
    const wait = Number(res.headers.get("retry-after")) || 5 * (i + 1);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  throw new Error("commons rate limited");
}

async function api(params) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ format: "json", ...params })) url.searchParams.set(k, v);
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(`commons api ${res.status}`);
  return res.json();
}

async function findImage(query) {
  const data = await api({
    action: "query", generator: "search", gsrsearch: `${query} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "15",
    prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: String(WIDTH * 2),
  });
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/^image\/(jpeg|png)$/.test(ii.mime) || ii.width < WIDTH || ii.width < ii.height) continue;
    const md = ii.extmetadata ?? {};
    const license = normalizeLicense(md.LicenseShortName?.value);
    if (!license) continue;
    const credit = stripHtml(md.Artist?.value).slice(0, 80) || "Wikimedia Commons";
    return { thumb: ii.thumburl, credit, license, sourceUrl: ii.descriptionurl };
  }
  return null;
}

async function loadSharp() {
  try { return (await import("sharp")).default; } catch { /* next 가 들고 있는 sharp 로 대체 */ }
  const req = createRequire(path.join(ROOT, "node_modules/next/package.json"));
  return req("sharp");
}

async function readExisting() {
  try {
    const src = await readFile(META_FILE, "utf8");
    const m = src.match(/DISCOVER_SPOT_IMAGES[^=]*=\s*(\{[\s\S]*?\n\});/);
    return m ? JSON.parse(m[1].replace(/,(\s*[}\]])/g, "$1")) : {};
  } catch { return {}; }
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.filter((a) => !a.startsWith("--"));
  const sharp = await loadSharp();
  await mkdir(OUT_DIR, { recursive: true });
  const meta = await readExisting();
  for (const [id, query] of Object.entries(SEARCH_QUERIES)) {
    if (only.length && !only.includes(id)) continue;
    const file = path.join(OUT_DIR, `${id}.webp`);
    const exists = await access(file).then(() => true, () => false);
    if (exists && meta[id] && !force) continue;
    try {
      const found = await findImage(query);
      if (!found) { console.log(`- ${id} 건너뜀: 허용 라이선스 결과 없음 (${query})`); continue; }
      const res = await politeFetch(found.thumb);
      if (!res.ok) { console.log(`- ${id} 건너뜀: 다운로드 ${res.status}`); continue; }
      const input = Buffer.from(await res.arrayBuffer());
      let buf;
      for (const q of [78, 70, 62, 55, 48]) {
        buf = await sharp(input).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: q }).toBuffer();
        if (buf.length <= MAX_BYTES) break;
      }
      await writeFile(file, buf);
      meta[id] = { src: `/discover/spots/${id}.webp`, credit: found.credit, license: found.license, sourceUrl: found.sourceUrl };
      console.log(`+ ${id} ${Math.round(buf.length / 1024)}KB ${found.license} ${found.sourceUrl}`);
    } catch (e) {
      console.log(`- ${id} 실패: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  const sorted = Object.fromEntries(Object.entries(meta).sort(([a], [b]) => a.localeCompare(b)));
  const body = JSON.stringify(sorted, null, 2).replace(/\n(\s*)"([^"]+)": \{/g, '\n$1"$2": {');
  const src = await readFile(META_FILE, "utf8");
  const next = src.replace(/(export const DISCOVER_SPOT_IMAGES[^=]*=\s*)\{[\s\S]*?\n\};/, `$1${body};`);
  await writeFile(META_FILE, next);
}

main().catch((e) => { console.error(e); process.exit(1); });
