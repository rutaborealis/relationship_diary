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

  // Throttle: notify on every save, but at most once per window per
  // (sender, recipient, date) so rapid re-saves don't spam the partner while a
  // genuine later edit still re-notifies.
  const THROTTLE_MS = 10 * 60 * 1000;
  const logKey = { PK: `USER#${userId}`, SK: `NOTIF#${partnerId}#${date}#entry_saved` };
  const existing = await getItem(MAIN, logKey);
  if (existing?.sent_at) {
    const elapsed = Date.now() - new Date(existing.sent_at as string).getTime();
    if (elapsed < THROTTLE_MS) return ok({ ok: true, skipped: true });
  }

  const pronoun  = (me.gender as string) === 'f' ? 'Она' : 'Он';
  const verb     = (me.gender as string) === 'f' ? 'заполнила' : 'заполнил';
  const suffix   = (me.gender as string) === 'f' ? 'а' : '';

  const sent = await sendPushToUser(partnerId, {
    title: `${pronoun} ${verb} дневник 💌`,
    body:  `${me.name} уже написал${suffix} сегодня`,
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url:   '/',
  });

  // Record the throttle marker only after a real send, so it never burns when
  // the partner has no active subscription yet.
  if (sent) await putItem(MAIN, { ...logKey, sent_at: new Date().toISOString() });

  return ok({ ok: true, sent });
});

export { handler };
