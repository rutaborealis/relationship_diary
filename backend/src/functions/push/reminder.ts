import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PUSH, updateItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const { reminderTime } = JSON.parse(event.body ?? '{}');

  // Clearing last_reminded invalidates today's "already reminded" mark, so the
  // new time fires cleanly today and the old time no longer counts as sent.
  await updateItem(PUSH, { userId }, {
    reminder_time: reminderTime ?? null,
    updated_at:    new Date().toISOString(),
    last_reminded: null,
  });

  return ok({ ok: true });
});

export { handler };
