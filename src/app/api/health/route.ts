import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { pool } from "@/lib/server/db";
import { getMapsUsage } from "@/lib/server/mapsBudget";
import { BLOB_ADVANCED_MONTHLY_LIMIT, getBlobAdvancedOps, isBlobLimitError } from "@/lib/server/blobBudget";

/**
 * 상태 점검 — 작업지시서 2026-10-13 "긴급: Vercel Blob 한도 초과" §3⑤. Cowork 이 주기적으로 부른다.
 * blob 은 읽기 1회(없는 경로의 get — Simple Operation 이고 null 이면 정상)로 한도·정지 오류를 감지하고, 우리가 센 이번 달 Advanced 사용량 추정치를 함께 낸다.
 * 비밀 값은 싣지 않는다. 하나라도 실패하면 503.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type BlobHealth = { status: "ok" | "limit" | "error" | "unconfigured"; message?: string; advancedOpsEstimate: number | null; advancedOpsLimit: number };

async function checkBlob(): Promise<BlobHealth> {
  const base = { advancedOpsEstimate: await getBlobAdvancedOps(), advancedOpsLimit: BLOB_ADVANCED_MONTHLY_LIMIT };
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return { status: "unconfigured", ...base };
  try {
    await get("health/probe.txt", { access: "private" }); // 없으면 null — 정상
    return { status: "ok", ...base };
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 200);
    return { status: isBlobLimitError(err) ? "limit" : "error", message, ...base };
  }
}

async function checkDb(): Promise<{ status: "ok" | "error"; message?: string }> {
  try {
    await pool.query("select 1");
    return { status: "ok" };
  } catch (err) {
    return { status: "error", message: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }
}

export async function GET() {
  const [blob, db, maps] = await Promise.all([checkBlob(), checkDb(), getMapsUsage()]);
  const ok = db.status === "ok" && (blob.status === "ok" || blob.status === "unconfigured");
  return NextResponse.json(
    {
      ok,
      db,
      blob,
      staticMapsKey: Boolean(process.env.GOOGLE_MAPS_SERVER_KEY),
      // 작업지시서 2026-10-14 "Places 호출 비용" §2① — SKU 별 이번 달 호출 수와 가드 상한(월 무료 한도의 90%). limit 에 닿으면 그 SKU 호출은 건너뛴다.
      maps,
      checkedAt: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
