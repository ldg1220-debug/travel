/**
 * 1회성 스크립트 — /discover 큐레이션 스팟(discoverData.ts)에 Google
 * place_id를 붙인다. discoverData.ts를 직접 고치지 않고 결과를 JSON
 * 리포트로만 출력한다 — 이름만으로 매칭하면 이 프로젝트에서 실제로
 * 겪은 문제(예: "Gyumon Dotonbori 2nd"와 "세계에서 가장 저렴하고 맛있는
 * 와규 스키야키 GYUMON"이 같은 업체, "규카츠 모토무라"가 지점명 차이로
 * 중복 통과)가 그대로 재현되기 때문에, 후보를 좌표로 검증만 하고 확정은
 * 사람이 리포트를 보고 한다.
 *
 * 실행: npx tsx scripts/match-spot-place-ids.ts [domestic|overseas|all]
 * 결과: scripts/output/spot-place-id-matches.json
 *
 * 리포트를 검토한 뒤, "matched"로 나온 항목만 discoverData.ts의 해당
 * spot 리터럴에 `placeId: "..."`를 손으로 추가한다 — 이 스크립트가
 * 자동으로 쓰지 않는다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allSpots, isPlaceholderSpot, type DiscoverScope, type DiscoverSpot } from "../src/lib/discoverData";
import { haversineDistanceMeters } from "../src/lib/geo";

const MATCH_RADIUS_METERS = 500;
const FIELD_MASK = "places.id,places.displayName,places.location,places.googleMapsUri";

type MatchStatus = "matched" | "no-candidate" | "too-far" | "skipped-placeholder" | "skipped-has-placeid" | "api-error";

interface MatchResult {
  spotId: string;
  name: string;
  region: string;
  status: MatchStatus;
  candidatePlaceId?: string;
  candidateName?: string;
  distanceMeters?: number;
  googleMapsUri?: string;
}

async function searchCandidate(
  spot: DiscoverSpot,
  apiKey: string,
): Promise<{ id: string; name?: string; lat: number; lng: number; googleMapsUri?: string } | null> {
  const query = `${spot.name} ${spot.region.replace(" · ", " ")}`;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1, languageCode: "ko" }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text?: string };
      location?: { latitude: number; longitude: number };
      googleMapsUri?: string;
    }>;
  };
  const place = data.places?.[0];
  if (!place?.location) return null;
  return {
    id: place.id,
    name: place.displayName?.text,
    lat: place.location.latitude,
    lng: place.location.longitude,
    googleMapsUri: place.googleMapsUri,
  };
}

async function matchOne(spot: DiscoverSpot, apiKey: string): Promise<MatchResult> {
  const base = { spotId: spot.id, name: spot.name, region: spot.region };
  if (isPlaceholderSpot(spot)) return { ...base, status: "skipped-placeholder" };
  if (spot.placeId) return { ...base, status: "skipped-has-placeid" };

  let candidate;
  try {
    candidate = await searchCandidate(spot, apiKey);
  } catch (err) {
    console.error(`[match] ${spot.id} 조회 실패:`, err);
    return { ...base, status: "api-error" };
  }
  if (!candidate) return { ...base, status: "no-candidate" };

  const distanceMeters = Math.round(
    haversineDistanceMeters({ lat: spot.lat, lng: spot.lng }, { lat: candidate.lat, lng: candidate.lng }),
  );
  const status: MatchStatus = distanceMeters <= MATCH_RADIUS_METERS ? "matched" : "too-far";
  return {
    ...base,
    status,
    candidatePlaceId: candidate.id,
    candidateName: candidate.name,
    distanceMeters,
    googleMapsUri: candidate.googleMapsUri,
  };
}

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_PLACES_API_KEY가 설정되지 않았어요 — .env.local에 넣고 다시 실행하세요.");
    process.exit(1);
  }

  const scopeArg = (process.argv[2] ?? "all") as DiscoverScope | "all";
  const scopes: DiscoverScope[] = scopeArg === "all" ? ["domestic", "overseas"] : [scopeArg];

  const results: MatchResult[] = [];
  for (const scope of scopes) {
    for (const spot of allSpots(scope)) {
      const result = await matchOne(spot, apiKey);
      results.push(result);
      console.log(`[${result.status}] ${spot.id} — ${spot.name}${result.distanceMeters != null ? ` (${result.distanceMeters}m)` : ""}`);
      // Text Search 연속 호출 사이 짧은 간격 — 짧은 시간에 수백 건을 몰아
      // 쏘지 않게 하는 정도의 예의, 엄밀한 rate limit 대응은 아니다.
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const summary = results.reduce<Record<MatchStatus, number>>(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {} as Record<MatchStatus, number>,
  );
  console.log("\n=== 요약 ===");
  console.log(summary);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.join(here, "output");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "spot-place-id-matches.json");
  await writeFile(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2) + "\n", "utf-8");
  console.log(`\n리포트 저장: ${outPath}`);
  console.log('"matched" 항목만 검토 후 discoverData.ts에 손으로 placeId를 추가하세요. "too-far"/"no-candidate"는 수동 확인 대상입니다.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
