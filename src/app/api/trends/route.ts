import { NextRequest, NextResponse } from "next/server";
import { getTrendingPlaces } from "@/lib/server/getTrendingPlaces";
import { DOMESTIC_PLACES } from "@/lib/mockPlacesDomestic";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

// ISR-style caching: this route's response is reused for an hour so the
// client never pays for a fresh Google/Kakao Places lookup on every page view.
export const revalidate = 3600;

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const region = request.nextUrl.searchParams.get("region");

  if (region === "domestic") {
    // Dummy domestic dataset (Phase 4 mockup) — swap for a Naver
    // blog/Place-sourced pipeline the same way src/server/pipeline does
    // for the international list.
    return NextResponse.json({ places: DOMESTIC_PLACES });
  }

  const places = await getTrendingPlaces();
  return NextResponse.json({ places });
});
