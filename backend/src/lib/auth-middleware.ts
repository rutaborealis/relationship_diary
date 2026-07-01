import type { APIGatewayProxyEvent } from 'aws-lambda';
import { verifyToken, type JwtPayload } from './jwt';
import { MAIN, getItem } from './dynamo';
import { HttpError } from './errors';

export async function requireAuth(event: APIGatewayProxyEvent): Promise<JwtPayload> {
  const header = event.headers?.['Authorization'] ?? event.headers?.['authorization'] ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Missing authorization token');

  const payload = await verifyToken(token);

  // Token invalidation after password reset (ADR-0002): the token carries the
  // tokenVersion it was issued with; a mismatch with the profile means a newer
  // password reset has revoked it. Absent attribute == 1 (no migration needed).
  const profile = await getItem(MAIN, { PK: `USER#${payload.userId}`, SK: 'PROFILE' });
  if (!profile) throw new HttpError(401, 'Invalid or expired token');
  if ((payload.tv ?? 1) !== ((profile.tokenVersion as number | undefined) ?? 1)) {
    throw new HttpError(401, 'Invalid or expired token');
  }

  return payload;
}
