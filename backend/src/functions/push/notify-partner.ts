import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, getItem, putItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { sendPushToUser } from '../../lib/webpush';
import { ok, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const { date } = JSON.parse(event.body ?? '{}');

  const me = await getItem(MAIN, { PK: `USER#${userId}`, SK: 'PROFILE' });
  if (!me?.partnerId) return ok({ ok: true, skipped: true });

  const partnerId = me.partnerId as string;

  // Idempotency check
  const logKey = { PK: `USER#${userId}`, SK: `NOTIF#${partnerId}#${date}#entry_saved` };
  const existing = await getItem(MAIN, logKey);
  if (existing) return ok({ ok: true, skipped: true });

  await putItem(MAIN, { ...logKey, sent_at: new Date().toISOString() });

  const pronoun  = (me.gender as string) === 'f' ? 'Она' : 'Он';
  const verb     = (me.gender as string) === 'f' ? 'заполнила' : 'заполнил';
  const suffix   = (me.gender as string) === 'f' ? 'а' : '';

  await sendPushToUser(partnerId, {
    title: `${pronoun} ${verb} дневник 💌`,
    body:  `${me.name} уже написал${suffix} сегодня`,
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url:   '/',
  });

  return ok({ ok: true });
});

export { handler };
