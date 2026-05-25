import jwt from 'jsonwebtoken';
import { getParameter } from './ssm';
import config from '../../config/app.config';
import { HttpError } from './errors';

export interface JwtPayload {
  userId: string;
  email: string;
}

async function getSecret(): Promise<string> {
  return config.jwt.localSecret || getParameter(config.jwt.ssmParamSecret);
}

export async function signToken(payload: JwtPayload): Promise<string> {
  const secret = await getSecret();
  return jwt.sign(payload, secret, {
    expiresIn: config.jwt.accessExpiresIn,
    issuer: config.jwt.issuer,
  });
}

export async function verifyToken(token: string): Promise<JwtPayload & jwt.JwtPayload> {
  const secret = await getSecret();
  try {
    return jwt.verify(token, secret, { issuer: config.jwt.issuer }) as JwtPayload & jwt.JwtPayload;
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
}
