import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, getItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);

  const profile = await getItem(MAIN, { PK: `USER#${userId}`, SK: 'PROFILE' });
  if (!profile) throw new HttpError(404, 'User not found');

  let partner = null;
  if (profile.partnerId) {
    const p = await getItem(MAIN, { PK: `USER#${profile.partnerId}`, SK: 'PROFILE' });
    if (p) partner = { id: p.userId, name: p.name, gender: p.gender };
  }

  return ok({
    id:        profile.userId,
    email:     profile.email,
    name:      profile.name,
    gender:    profile.gender,
    partnerId: profile.partnerId ?? null,
    partner,
  });
});

export { handler };
