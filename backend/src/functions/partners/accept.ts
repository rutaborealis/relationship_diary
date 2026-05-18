import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, getItem, updateItem, transactWrite } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const { token } = JSON.parse(event.body ?? '{}');

  if (!token) throw new HttpError(400, 'Missing token');

  const invite = await getItem(MAIN, { PK: `INVITE#${token}`, SK: 'META' });
  if (!invite) throw new HttpError(404, 'Invitation not found or expired');
  if (invite.status !== 'pending') throw new HttpError(409, 'Invitation already used');

  const nowSec = Math.floor(Date.now() / 1000);
  if ((invite.ttl as number) < nowSec) throw new HttpError(400, 'Invitation has expired');

  const senderId = invite.senderId as string;
  if (senderId === userId) throw new HttpError(400, 'Cannot accept your own invitation');

  const me = await getItem(MAIN, { PK: `USER#${userId}`, SK: 'PROFILE' });
  if (!me) throw new HttpError(404, 'User not found');
  if (me.partnerId) throw new HttpError(409, 'You already have a partner');

  const sender = await getItem(MAIN, { PK: `USER#${senderId}`, SK: 'PROFILE' });
  if (!sender) throw new HttpError(404, 'Sender account not found');
  if (sender.partnerId) throw new HttpError(409, 'Sender already has a partner');

  await transactWrite([
    {
      Update: {
        TableName: MAIN,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
        UpdateExpression: 'SET partnerId = :pid',
        ExpressionAttributeValues: { ':pid': senderId },
      },
    },
    {
      Update: {
        TableName: MAIN,
        Key: { PK: `USER#${senderId}`, SK: 'PROFILE' },
        UpdateExpression: 'SET partnerId = :pid',
        ExpressionAttributeValues: { ':pid': userId },
      },
    },
    {
      Update: {
        TableName: MAIN,
        Key: { PK: `INVITE#${token}`, SK: 'META' },
        UpdateExpression: 'SET #s = :accepted',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':accepted': 'accepted' },
      },
    },
  ]);

  return ok({
    message: 'Partnership established',
    partner: { id: senderId, name: sender.name, gender: sender.gender },
  });
});

export { handler };
