import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import { MAIN, getItem, putItem } from '../../lib/dynamo';
import { sendEmail } from '../../lib/ses';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';
import config from '../../../config/app.config';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { email, name, gender, password } = JSON.parse(event.body ?? '{}');

  if (!email || !name || !gender || !password) throw new HttpError(400, 'Missing required fields');
  if (!['m', 'f'].includes(gender)) throw new HttpError(400, 'Invalid gender');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await getItem(MAIN, { PK: `EMAIL#${normalizedEmail}`, SK: 'USER' });
  if (existing) throw new HttpError(409, 'Email already registered');

  const code = Array.from({ length: config.auth.verificationCodeLength }, () =>
    Math.floor(Math.random() * 10),
  ).join('');

  const ttl = Math.floor(Date.now() / 1000) + config.auth.verificationCodeTtlMin * 60;
  const passwordHash = await bcrypt.hash(password, config.auth.bcryptSaltRounds);

  await putItem(MAIN, {
    PK:           `VERIFY#${normalizedEmail}`,
    SK:           'CODE',
    code,
    ttl,
    pendingUser:  { email: normalizedEmail, name: name.trim(), gender, passwordHash },
  });

  await sendEmail({
    to:      normalizedEmail,
    subject: 'Подтверди email — Relationship Diary',
    html:    `<p>Привет, ${name}!</p><p>Твой код подтверждения: <strong>${code}</strong></p><p>Код действует ${config.auth.verificationCodeTtlMin} минут.</p>`,
    text:    `Код подтверждения: ${code}`,
  });

  return ok({ message: 'Verification code sent' });
});

export { handler };
