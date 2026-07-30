"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

/**
 * Fires once per app load for non-logged-in visitors, so the admin
 * dashboard has some visibility into anonymous traffic (previously it had
 * none — only Vercel Analytics did). Skips entirely once a session exists,
 * since logged-in activity is already tracked via users."lastActiveAt".
 * Renders nothing.
 */
export function VisitorPing() {
  const { status } = useSession();
  const sent = useRef(false);

  useEffect(() => {
    if (status !== "unauthenticated" || sent.current) return;
    sent.current = true;
    fetch("/api/track/visit", { method: "POST" }).catch(() => {});
  }, [status]);

  return null;
}
