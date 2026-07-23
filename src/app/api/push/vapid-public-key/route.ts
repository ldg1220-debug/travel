import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

/** The VAPID public key the client needs to create a push subscription. Empty string when push isn't configured yet (no Vercel env vars set) — the client treats that as "push unavailable". Trimmed defensively — see src/lib/server/push.ts for why. */
export const GET = withApiErrorHandling(async () => {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY?.trim() ?? "" });
});
