import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PUSH, getItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const row = await getItem(PUSH, { userId });
  return ok({ reminderTime: row?.reminder_time ?? null });
});

export { handler };
