import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, query } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);

  const items = await query(MAIN, {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'QUALITY#' },
  });

  const qualities = items
    .map((item) => ({ id: item.qualityId, text: item.text, created_at: item.created_at }))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  return ok(qualities);
});

export { handler };
