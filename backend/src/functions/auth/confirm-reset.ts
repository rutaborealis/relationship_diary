import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { MAIN, db, getItem, putItem, deleteItem } from '../../lib/dynamo';
import { sha256, timingSafeEqualHex } from '../../lib/secure-code';
import { sendEmail } from '../../lib/ses';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';
import config from '../../../config/app.config';

// One generic message for every code failure (missing / expired / wrong / locked /
// throttled) so we never reveal account state beyond the fact a code was received
// (FR-9, AC-7/8).
const INVALID_CODE = 'Неверный или истёкший код';

const RLC_WINDOW_SEC = 3600; // confirm-reset rate-limit window (1h)

/**
 * Sliding-window rate limit for confirm-reset, keyed on email (RESET#<email>/RLC).
 * Bounds total guess attempts per email/hour — including attempts spread across
 * freshly re-created codes (a new code resets the per-code attempts counter, so the
 * per-code cap alone is not enough). Returns false when the request must be dropped.
 */
async function allowConfirm(email: string): Promise<boolean> {
  const nowSec = Math.floor(Date.now() / 1000);
  const rl = await getItem(MAIN, { PK: `RESET#${email}`, SK: 'RLC' });

  let count: number;
  let windowStart: number;

  if (!rl || (rl.windowStart as number) < nowSec - RLC_WINDOW_SEC) {
    count = 1;
    windowStart = nowSec;
  } else {
    count = (rl.count as number) + 1;
    windowStart = rl.windowStart as number;
    if (count > config.auth.resetConfirmRateLimitPerHour) return false;
  }

  await putItem(MAIN, {
    PK:          `RESET#${email}`,
    SK:          'RLC',
    count,
    windowStart,
    ttl:         windowStart + RLC_WINDOW_SEC,
  });
  return true;
}

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { email, code, newPassword } = JSON.parse(event.body ?? '{}');

  if (!email || !code || !newPassword) throw new HttpError(400, 'Missing required fields');
  if (String(newPassword).length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

  const normalizedEmail = String(email).trim().toLowerCase();
  const key = { PK: `RESET#${normalizedEmail}`, SK: 'CODE' };

  // Per-email confirm rate limit (defence-in-depth across code re-creations).
  if (!(await allowConfirm(normalizedEmail))) throw new HttpError(400, INVALID_CODE);

  const record = await getItem(MAIN, key);
  if (!record) throw new HttpError(400, INVALID_CODE);

  const nowSec = Math.floor(Date.now() / 1000);
  if ((record.ttl as number) < nowSec) {
    await deleteItem(MAIN, key);
    throw new HttpError(400, INVALID_CODE);
  }

  // Atomic attempt gate (SEC-01 / BUG-1): consume one persistent attempt BEFORE any
  // comparison. ADD ... ConditionExpression `attempts < :max` lets the increment
  // succeed only while attempts is 0,1,2,3,4 → exactly 5 comparisons; the 6th sees
  // attempts == 5, the condition fails, and the code is invalidated. Because the
  // increment is atomic, N concurrent requests cannot perform more than :max
  // comparisons (each comparison is gated by a successful persistent increment).
  try {
    await db.send(new UpdateCommand({
      TableName:                 MAIN,
      Key:                       key,
      UpdateExpression:          'ADD attempts :one',
      ConditionExpression:       'attempts < :max',
      ExpressionAttributeValues: { ':one': 1, ':max': config.auth.resetMaxAttempts },
    }));
  } catch (err) {
    // ConditionalCheckFailed = limit reached (or code already consumed/deleted by a
    // concurrent success) → invalidate the code (AC-8). Re-throw other errors.
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      await deleteItem(MAIN, key);
      throw new HttpError(400, INVALID_CODE);
    }
    throw err;
  }

  // Attempt consumed. Only now do the timing-safe comparison (FR-8). On mismatch the
  // attempt is already counted persistently, so brute force is bounded by :max.
  const match = timingSafeEqualHex(record.codeHash as string, sha256(String(code).trim()));
  if (!match) throw new HttpError(400, INVALID_CODE);

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
