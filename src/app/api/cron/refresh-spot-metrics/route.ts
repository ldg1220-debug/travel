import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { allSpots } from "@/lib/discoverData";

// rating/userRatingCount/priceLevel/regularOpeningHours는 Place Details의
// Enterprise SKU다 — 월 무료 한도가 가장 낮은 티어(1,000회)라, 사용자
// 조회마다 부르면 안 되고 이 배치로만 채운다. 큐레이션 스팟이 ~100곳이면
// 월 1회 갱신은 월 ~100회로 여유 있게 한도 안이다.
const FIELD_MASK = "rating,userRatingCount,priceLevel,regularOpeningHours";

/**
 * Vercel Cron(vercel.json, 월 1회)이 호출 — /discover 큐레이션 스팟 중
 * placeId가 확정된 것만(scripts/match-spot-place-ids.ts로 좌표 검증 후
 * 수동으로 채운 값) Google Place Details를 조회해 spot_place_metrics에
 * upsert한다. placeId가 없는 스팟(편집 개념 카드, 미매칭 스팟, 템플릿
 * 생성 스팟)은 건너뛴다 — 조용히.
 *
 * Google ToS상 rating 등 콘텐츠는 30일 초과 보관이 제한돼 있어(placeId
 * 자체는 무기한 저장 가능) 이 배치가 멈추면 spot_place_metrics의 로우가
 * getSpotMetrics.ts에서 30일 지나 자동으로 "만료" 취급되며 카드에서
 * 지표가 사라진다 — 실패를 아는 방법은 지금은 이 응답의 failed 카운트와
 * Vercel Cron 실행 로그뿐이다. 실패 알림(Slack/이메일 등)은 아직 연결
 * 안 했다 — 어느 채널로 보낼지 결정되면 추가할 것.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET이 설정되지 않았어요" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY가 설정되지 않았어요" }, { status: 500 });
  }

  const spots = [...allSpots("domestic"), ...allSpots("overseas")].filter(
    (spot): spot is typeof spot & { placeId: string } => Boolean(spot.placeId),
  );

  let updated = 0;
  let failed = 0;
  const failedIds: string[] = [];

  for (const spot of spots) {
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${spot.placeId}`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
      });
      if (!res.ok) {
        failed++;
        failedIds.push(spot.id);
        continue;
      }
      const data = (await res.json()) as {
        rating?: number;
        userRatingCount?: number;
        priceLevel?: string;
        regularOpeningHours?: unknown;
      };
      await pool.query(
        `insert into spot_place_metrics (spot_id, place_id, rating, review_count, price_level, opening_hours, updated_at)
         values ($1, $2, $3, $4, $5, $6, now())
         on conflict (spot_id) do update set
           place_id = excluded.place_id,
           rating = excluded.rating,
           review_count = excluded.review_count,
           price_level = excluded.price_level,
           opening_hours = excluded.opening_hours,
           updated_at = now()`,
        [
          spot.id,
          spot.placeId,
          data.rating ?? null,
          data.userRatingCount ?? null,
          priceLevelToInt(data.priceLevel),
          data.regularOpeningHours ? JSON.stringify(data.regularOpeningHours) : null,
        ],
      );
      updated++;
    } catch (err) {
      console.error(`[refresh-spot-metrics] ${spot.id} 실패:`, err);
      failed++;
      failedIds.push(spot.id);
    }
  }

  return NextResponse.json({ ok: true, total: spots.length, updated, failed, failedIds });
});

// Places API (New)는 priceLevel을 "PRICE_LEVEL_FREE".."PRICE_LEVEL_VERY_EXPENSIVE"
// 문자열로 준다 — 카드 표시는 기존 코드 전체가 숫자(₩ 반복 횟수)를 쓰므로 맞춰 변환.
function priceLevelToInt(level: string | undefined): number | null {
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return level ? (map[level] ?? null) : null;
}
