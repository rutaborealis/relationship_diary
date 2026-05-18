import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, getItem, scan } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';
import config from '../../../config/app.config';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const q = (event.queryStringParameters?.q ?? '').trim().toLowerCase();

  if (!q || q.length < 2) throw new HttpError(400, 'Query must be at least 2 characters');

  const me = await getItem(MAIN, { PK: `USER#${userId}`, SK: 'PROFILE' });

  // First try exact email match
  const emailLookup = await getItem(MAIN, { PK: `EMAIL#${q}`, SK: 'USER' });
  if (emailLookup) {
    if (emailLookup.userId === userId) return ok([]);
    if (me?.partnerId === emailLookup.userId) return ok([]);
    return ok([{
      id:     emailLookup.userId,
      name:   emailLookup.name,
      gender: emailLookup.gender,
      email:  emailLookup.email,
    }]);
  }

  // Otherwise scan by name (acceptable at small scale)
  const items = await scan(MAIN, {
    FilterExpression: 'SK = :sk AND contains(#nm, :q)',
    ExpressionAttributeNames: { '#nm': 'name' },
    ExpressionAttributeValues: { ':sk': 'PROFILE', ':q': q },
  });

  const results = items
    .filter((item) => item.userId !== userId && item.userId !== me?.partnerId)
    .map((item) => ({ id: item.userId, name: item.name, gender: item.gender }));

  // Limit to first 10 results
  return ok(results.slice(0, 10));
});

export { handler };
