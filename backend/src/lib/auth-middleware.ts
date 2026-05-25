import type { APIGatewayProxyEvent } from 'aws-lambda';
import { verifyToken, type JwtPayload } from './jwt';
import { HttpError } from './errors';

export async function requireAuth(event: APIGatewayProxyEvent): Promise<JwtPayload> {
  const header = event.headers?.['Authorization'] ?? event.headers?.['authorization'] ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Missing authorization token');
  return verifyToken(token);
}
