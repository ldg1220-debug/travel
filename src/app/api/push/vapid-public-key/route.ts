import { NextResponse } from "next/server";

/** The VAPID public key the client needs to create a push subscription. Empty string when push isn't configured yet (no Vercel env vars set) — the client treats that as "push unavailable". */
export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? "" });
}
