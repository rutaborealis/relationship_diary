import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { PUSH, db, updateItem } from '../../lib/dynamo';
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

    // The reminder is an explicit user request — fire it at the chosen time
    // regardless of whether an entry already exists (entries can be edited /
    // supplemented all day).

    // Fire at most once per day. The mark lives on the push row; changing the
    // reminder time clears it (push/reminder.ts), so a new time re-arms today.
    if (sub.last_reminded === today) continue;
    await updateItem(PUSH, { userId }, { last_reminded: today });

    await sendPushToUser(userId, {
      title: 'Дневник ждёт 📖',
      body:  'Не забудь написать сегодня',
      icon:  '/icons/icon-192.png',
      url:   '/',
    });
  }
};
