import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, updateItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const id   = event.pathParameters?.id;
  const { text } = JSON.parse(event.body ?? '{}');

  if (!id) throw new HttpError(400, 'Missing quality id');
  if (!text?.trim()) throw new HttpError(400, 'Missing text');

  await updateItem(MAIN, { PK: `USER#${userId}`, SK: `QUALITY#${id}` }, { text: text.trim() });
  return ok({ ok: true });
});

export { handler };
