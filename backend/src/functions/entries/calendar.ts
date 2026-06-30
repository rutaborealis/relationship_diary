import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, getItem, query } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const qs = event.queryStringParameters ?? {};
  const year  = parseInt(qs.year  ?? '', 10);
  const month = parseInt(qs.month ?? '', 10); // 0-based

  if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
    throw new HttpError(400, 'Missing or invalid year/month');
  }

  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;

  const me = await getItem(MAIN, { PK: `USER#${userId}`, SK: 'PROFILE' });
  const partnerId = me?.partnerId as string | undefined;

  const [myItems, partnerItems] = await Promise.all([
    query(MAIN, {
      KeyConditionExpression: 'PK = :pk AND SK BETWEEN :from AND :to',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':from': `ENTRY#${from}`, ':to': `ENTRY#${to}` },
      ProjectionExpression: '#d',
      ExpressionAttributeNames: { '#d': 'date' },
    }),
    partnerId
      ? query(MAIN, {
          KeyConditionExpression: 'PK = :pk AND SK BETWEEN :from AND :to',
          ExpressionAttributeValues: { ':pk': `USER#${partnerId}`, ':from': `ENTRY#${from}`, ':to': `ENTRY#${to}` },
          ProjectionExpression: '#d, #sh',
          ExpressionAttributeNames: { '#d': 'date', '#sh': 'shared' },
        })
      : Promise.resolve([]),
  ]);

  const calMap: Record<string, { mine?: boolean; theirs?: boolean }> = {};
  for (const r of myItems)      { calMap[r.date as string] = { ...calMap[r.date as string], mine:   true }; }
  // Unsent partner drafts (shared === false) stay hidden — no dot for them.
  for (const r of partnerItems) {
    if (r.shared === false) continue;
    calMap[r.date as string] = { ...calMap[r.date as string], theirs: true };
  }

  return ok(calMap);
});

export { handler };
