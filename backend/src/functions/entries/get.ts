import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, getItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const date = event.queryStringParameters?.date;
  if (!date) throw new HttpError(400, 'Missing date');

  const me = await getItem(MAIN, { PK: `USER#${userId}`, SK: 'PROFILE' });

  const [myEntry, partnerEntry] = await Promise.all([
    getItem(MAIN, { PK: `USER#${userId}`, SK: `ENTRY#${date}` }),
    me?.partnerId
      ? getItem(MAIN, { PK: `USER#${me.partnerId}`, SK: `ENTRY#${date}` })
      : Promise.resolve(null),
  ]);

  // free_thought is private — never send it to client (partner view goes through /api/partner-entry)
  const sanitize = (e: Record<string, unknown> | null) =>
    e ? { ...e, free_thought: undefined, PK: undefined, SK: undefined } : null;

  return ok({
    entry:        sanitize(myEntry as Record<string, unknown> | null),
    partnerEntry: sanitize(partnerEntry as Record<string, unknown> | null),
  });
});

export { handler };
