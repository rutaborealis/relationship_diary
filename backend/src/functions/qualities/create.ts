import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { MAIN, putItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const { text } = JSON.parse(event.body ?? '{}');
  if (!text?.trim()) throw new HttpError(400, 'Missing text');

  const qualityId = uuidv4();
  const now = new Date().toISOString();

  await putItem(MAIN, {
    PK:         `USER#${userId}`,
    SK:         `QUALITY#${qualityId}`,
    qualityId,
    userId,
    text:       text.trim(),
    created_at: now,
  });

  return ok({ id: qualityId, text: text.trim(), created_at: now }, 201);
});

export { handler };
