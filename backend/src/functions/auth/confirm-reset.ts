import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { MAIN, db, getItem, deleteItem } from '../../lib/dynamo';
import { sha256, timingSafeEqualHex } from '../../lib/secure-code';
import { sendEmail } from '../../lib/ses';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';
import config from '../../../config/app.config';

// One generic message for every code failure (missing / expired / wrong / locked)
// so we never reveal account state beyond the fact a code was received (FR-9, AC-7/8).
const INVALID_CODE = 'Неверный или истёкший код';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { email, code, newPassword } = JSON.parse(event.body ?? '{}');

  if (!email || !code || !newPassword) throw new HttpError(400, 'Missing required fields');
  if (String(newPassword).length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

  const normalizedEmail = String(email).trim().toLowerCase();
  const key = { PK: `RESET#${normalizedEmail}`, SK: 'CODE' };

  const record = await getItem(MAIN, key);
  if (!record) throw new HttpError(400, INVALID_CODE);

  const nowSec = Math.floor(Date.now() / 1000);
  if ((record.ttl as number) < nowSec) {
    await deleteItem(MAIN, key);
    throw new HttpError(400, INVALID_CODE);
  }

  // Timing-safe comparison of stored vs. submitted code hash (FR-8).
  const match = timingSafeEqualHex(record.codeHash as string, sha256(String(code).trim()));

  if (!match) {
    // Atomically bump the attempt counter, capped at the max (FR-9). When the cap
    // is already reached the condition fails → invalidate the code entirely (AC-8).
    try {
      await db.send(new UpdateCommand({
        TableName:                 MAIN,
        Key:                       key,
        UpdateExpression:          'ADD attempts :one',
        ConditionExpression:       'attempts < :max',
        ExpressionAttributeValues: { ':one': 1, ':max': config.auth.resetMaxAttempts },
      }));
    } catch {
      await deleteItem(MAIN, key);
    }
    throw new HttpError(400, INVALID_CODE);
  }

  // Valid code → set the new hash and bump tokenVersion in one atomic write
  // (ADR-0002, FR-12/FR-14). if_not_exists(...) + 1 turns an implicit v1 into v2,
  // so every previously issued token (tv <= 1) is revoked.
  const passwordHash = await bcrypt.hash(newPassword, config.auth.bcryptSaltRounds);
  await db.send(new UpdateCommand({
    TableName:                 MAIN,
    Key:                       { PK: `USER#${record.userId}`, SK: 'PROFILE' },
    UpdateExpression:          'SET passwordHash = :ph, tokenVersion = if_not_exists(tokenVersion, :one) + :one',
    ExpressionAttributeValues: { ':ph': passwordHash, ':one': 1 },
  }));

  // One-time code is consumed — remove it so it cannot be reused (FR-13, AC-6).
  await deleteItem(MAIN, key);

  // Best-effort "password changed" notification (FR-17). Must not fail the reset.
  try {
    await sendEmail({
      to:      normalizedEmail,
      subject: 'Пароль изменён — Relationship Diary',
      html:    '<p>Привет!</p><p>Пароль от вашего аккаунта был изменён. Если это были не вы — немедленно сбросьте пароль ещё раз и проверьте безопасность почты.</p>',
      text:    'Пароль от вашего аккаунта был изменён. Если это были не вы — немедленно сбросьте пароль ещё раз.',
    });
  } catch (err) {
    console.error('confirm-reset notify failed:', err instanceof Error ? err.message : 'unknown error');
  }

  return ok({ message: 'Пароль изменён. Войдите с новым паролем.' });
});

export { handler };
