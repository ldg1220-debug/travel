import webpush from "web-push";
import { pool } from "@/lib/server/db";

// .trim() defensively — a copy-pasted env var picking up a trailing
// newline/space is invisible in most UIs but makes web-push's strict
// base64url validation reject an otherwise-correct key.
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY?.trim();
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim();
const vapidSubject = process.env.VAPID_SUBJECT?.trim() ?? "mailto:ldg1220@naver.com";

// setVapidDetails validates the key pair synchronously and throws on a
// malformed one — since this module is imported at build time by every API
// route that can trigger a push (follows, messages, likes), an invalid key
// would otherwise fail `next build` entirely instead of just disabling
// push. Configuring push is optional, so a bad key degrades to "push
// silently unavailable" rather than taking the whole app down.
let vapidConfigured = false;
if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    vapidConfigured = true;
  } catch (err) {
    console.error("Invalid VAPID keys — push notifications disabled:", err);
  }
}

// The known browser push services — an `endpoint` is a URL the *browser*
// hands us at subscribe time, but we never verify it's actually one of
// these before storing it. Without this allowlist, a logged-in user could
// register an arbitrary URL (an internal service, a cloud metadata
// endpoint, ...) as their "push endpoint", and every like/follow/message
// they receive would make our own server issue an outbound POST to it —
// a classic web-push SSRF pattern.
const TRUSTED_PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome/Edge/Opera/Samsung Internet (Chromium)
  "android.googleapis.com", // legacy GCM fallback some older Chromium builds still use
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari (macOS/iOS 16.4+)
];
const TRUSTED_PUSH_HOST_SUFFIXES = [".notify.windows.com"]; // legacy Edge/WNS, subdomain per device

export function isTrustedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return TRUSTED_PUSH_HOSTS.includes(url.hostname) || TRUSTED_PUSH_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * Sends an installed-app (PWA) push notification to every device the user
 * has subscribed on. A no-op (never throws) when VAPID keys aren't
 * configured — lets the rest of the app work fine before that env setup is
 * done. Subscriptions that the push service reports as gone (410/404) are
 * cleaned up as a side effect, since the browser won't tell us otherwise.
 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!vapidConfigured) return;

  const result = await pool.query(`select id, endpoint, p256dh, auth from push_subscriptions where "userId" = $1`, [userId]);
  const body = JSON.stringify(payload);

  await Promise.all(
    result.rows.map(async (row) => {
      // Belt-and-suspenders re-check — closes the SSRF hole for rows
      // written before this validation existed, without needing a backfill.
      if (!isTrustedPushEndpoint(row.endpoint)) return;
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await pool.query(`delete from push_subscriptions where id = $1`, [row.id]);
        }
      }
    }),
  );
}
