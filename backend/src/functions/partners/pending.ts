import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, getItem, scan } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);

  const me = await getItem(MAIN, { PK: `USER#${userId}`, SK: 'PROFILE' });
  const myEmail = me?.email as string | undefined;

  if (!myEmail) return ok({ invite: null });

  const nowSec = Math.floor(Date.now() / 1000);

  const items = await scan(MAIN, {
    FilterExpression: 'begins_with(PK, :prefix) AND SK = :sk AND recipientEmail = :email AND #s = :pending AND #ttl > :now',
    ExpressionAttributeNames: { '#s': 'status', '#ttl': 'ttl' },
    ExpressionAttributeValues: {
      ':prefix': 'INVITE#',
      ':sk':     'META',
      ':email':  myEmail,
      ':pending': 'pending',
      ':now':    nowSec,
    },
  });

  if (!items.length) return ok({ invite: null });

  const invite = items[0];
  return ok({
    invite: {
      token:      invite.token,
      senderName: invite.senderName,
    },
  });
});

export { handler };
