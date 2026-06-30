import webpush from 'web-push';
import { getParameter } from './ssm';
import config from '../../config/app.config';
import { PUSH, getItem, updateItem } from './dynamo';

let vapidInitialized = false;

async function initVapid(): Promise<void> {
  if (vapidInitialized) return;
  const [publicKey, privateKey, email] = await Promise.all([
    getParameter(config.vapid.ssmParamPublicKey),
    getParameter(config.vapid.ssmParamPrivateKey),
    getParameter(config.vapid.ssmParamEmail),
  ]);
  webpush.setVapidDetails(`mailto:${email}`, publicKey, privateKey);
  vapidInitialized = true;
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
}

// Returns true only when the notification was actually handed off to the push
// service, so callers can record idempotency/throttle markers based on real delivery.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<boolean> {
  await initVapid();

  const row = await getItem(PUSH, { userId });
  if (!row?.subscription) return false;

  try {
    await webpush.sendNotification(
      row.subscription as webpush.PushSubscription,
      JSON.stringify(payload),
    );
    return true;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 410 || statusCode === 404) {
      // Stale subscription — drop only the subscription, keep reminder_time so
      // the daily reminder survives (it'll fire again once the user re-subscribes).
      await updateItem(PUSH, { userId }, { subscription: null });
    } else {
      console.error('Push send error:', (err as Error).message);
    }
    return false;
  }
}

export { initVapid };
