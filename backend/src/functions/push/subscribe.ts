import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PUSH, putItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const { subscription } = JSON.parse(event.body ?? '{}');

  if (!subscription) throw new HttpError(400, 'Missing subscription');

  await putItem(PUSH, {
    userId,
    subscription,
    updated_at: new Date().toISOString(),
  });

  return ok({ ok: true });
});

export { handler };
