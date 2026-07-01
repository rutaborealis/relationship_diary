import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { MAIN, getItem, deleteItem, transactWrite } from '../../lib/dynamo';
import { signToken } from '../../lib/jwt';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { email, code } = JSON.parse(event.body ?? '{}');
  if (!email || !code) throw new HttpError(400, 'Missing email or code');

  const normalizedEmail = email.trim().toLowerCase();
  const record = await getItem(MAIN, { PK: `VERIFY#${normalizedEmail}`, SK: 'CODE' });

  if (!record) throw new HttpError(400, 'No pending verification for this email');

  const nowSec = Math.floor(Date.now() / 1000);
  if (record.ttl < nowSec) throw new HttpError(400, 'Verification code expired');
  if (record.code !== code.trim()) throw new HttpError(400, 'Invalid verification code');

  const { email: userEmail, name, gender, passwordHash } = record.pendingUser as {
    email: string; name: string; gender: string; passwordHash: string;
  };

  const userId = uuidv4();
  const now = new Date().toISOString();

  await transactWrite([
    {
      Put: {
        TableName: MAIN,
        Item: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
          userId,
          email: userEmail,
          name,
          gender,
          passwordHash,
          emailVerified: true,
          partnerId: null,
          created_at: now,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    {
      Put: {
        TableName: MAIN,
        Item: {
          PK: `EMAIL#${userEmail}`,
          SK: 'USER',
          userId,
          email: userEmail,
          name,
          gender,
          emailVerified: true,
          partnerId: null,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
  ]);

  await deleteItem(MAIN, { PK: `VERIFY#${normalizedEmail}`, SK: 'CODE' });

  const token = await signToken({ userId, email: userEmail, tv: 1 });
  return ok({ token, user: { id: userId, email: userEmail, name, gender } });
});

export { handler };
