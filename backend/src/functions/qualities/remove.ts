import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, deleteItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const id = event.pathParameters?.id;
  if (!id) throw new HttpError(400, 'Missing quality id');

  await deleteItem(MAIN, { PK: `USER#${userId}`, SK: `QUALITY#${id}` });
  return ok({ ok: true });
});

export { handler };
