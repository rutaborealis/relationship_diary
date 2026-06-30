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

  const stripKeys = (e: Record<string, unknown> | null): Record<string, unknown> | null =>
    e ? { ...e, PK: undefined, SK: undefined } : null;

  // Own entry: keep everything (including private free_thought + draft status).
  const mine = stripKeys(myEntry as Record<string, unknown> | null);

  // Partner entry: free_thought is private, and unsent drafts (shared === false)
  // must stay hidden so only the final version reaches the partner. Legacy
  // entries without a `shared` flag are treated as shared (always visible).
  let theirs = stripKeys(partnerEntry as Record<string, unknown> | null);
  if (theirs) {
    theirs = theirs.shared === false ? null : { ...theirs, free_thought: undefined };
  }

  return ok({ entry: mine, partnerEntry: theirs });
});

export { handler };
