import webpush from 'web-push';
import { getParameter } from './ssm';
import config from '../../config/app.config';
import { PUSH, getItem, deleteItem } from './dynamo';

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

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  await initVapid();

  const row = await getItem(PUSH, { userId });
  if (!row?.subscription) return;

  try {
    await webpush.sendNotification(
      row.subscription as webpush.PushSubscription,
      JSON.stringify(payload),
    );
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 410 || statusCode === 404) {
      await deleteItem(PUSH, { userId });
    } else {
      console.error('Push send error:', (err as Error).message);
    }
  }
}

export { initVapid };
