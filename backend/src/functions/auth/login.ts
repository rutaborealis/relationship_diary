import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import { MAIN, getItem } from '../../lib/dynamo';
import { signToken } from '../../lib/jwt';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { email, password } = JSON.parse(event.body ?? '{}');
  if (!email || !password) throw new HttpError(400, 'Missing email or password');

  const normalizedEmail = email.trim().toLowerCase();

  const lookup = await getItem(MAIN, { PK: `EMAIL#${normalizedEmail}`, SK: 'USER' });
  if (!lookup) throw new HttpError(401, 'Invalid email or password');

  const profile = await getItem(MAIN, { PK: `USER#${lookup.userId}`, SK: 'PROFILE' });
  if (!profile) throw new HttpError(401, 'Invalid email or password');

  const match = await bcrypt.compare(password, profile.passwordHash as string);
  if (!match) throw new HttpError(401, 'Invalid email or password');

  const token = await signToken({
    userId: profile.userId as string,
    email: normalizedEmail,
    tv: (profile.tokenVersion as number | undefined) ?? 1,
  });
  return ok({
    token,
    user: {
      id:        profile.userId,
      email:     profile.email,
      name:      profile.name,
      gender:    profile.gender,
      partnerId: profile.partnerId ?? null,
    },
  });
});

export { handler };
