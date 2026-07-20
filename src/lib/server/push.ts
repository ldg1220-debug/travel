import webpush from "web-push";
import { pool } from "@/lib/server/db";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:ldg1220@naver.com";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
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
  if (!vapidPublicKey || !vapidPrivateKey) return;

  const result = await pool.query(`select id, endpoint, p256dh, auth from push_subscriptions where "userId" = $1`, [userId]);
  const body = JSON.stringify(payload);

  await Promise.all(
    result.rows.map(async (row) => {
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
