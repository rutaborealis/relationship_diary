import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { MAIN, PUSH, db, getItem, putItem } from '../../lib/dynamo';
import { sendPushToUser } from '../../lib/webpush';
import config from '../../../config/app.config';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentHHMM(): string {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const handler = async (): Promise<void> => {
  const currentTime = currentHHMM();
  const today = todayStr();

  const res = await db.send(new QueryCommand({
    TableName: PUSH,
    IndexName: config.dynamo.indexes.reminderTimeIndex,
    KeyConditionExpression: 'reminder_time = :rt',
    ExpressionAttributeValues: { ':rt': currentTime },
  }));

  const subs = res.Items ?? [];
  if (!subs.length) return;

  for (const sub of subs) {
    const userId = sub.userId as string;

    const entry = await getItem(MAIN, { PK: `USER#${userId}`, SK: `ENTRY#${today}` });
    if (entry) continue;

    const logKey = { PK: `USER#${userId}`, SK: `NOTIF#${userId}#${today}#reminder` };
    const logged = await getItem(MAIN, logKey);
    if (logged) continue;

    await putItem(MAIN, { ...logKey, sent_at: new Date().toISOString() });

    await sendPushToUser(userId, {
      title: 'Дневник ждёт 📖',
      body:  'Не забудь написать сегодня',
      icon:  '/icons/icon-192.png',
      url:   '/',
    });
  }
};
