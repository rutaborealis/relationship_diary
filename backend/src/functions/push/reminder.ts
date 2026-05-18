import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PUSH, updateItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const { reminderTime } = JSON.parse(event.body ?? '{}');

  await updateItem(PUSH, { userId }, {
    reminder_time: reminderTime ?? null,
    updated_at:    new Date().toISOString(),
  });

  return ok({ ok: true });
});

export { handler };
