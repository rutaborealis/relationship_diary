import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, getItem, putItem } from '../../lib/dynamo';
import { generateNumericCode, sha256 } from '../../lib/secure-code';
import { sendEmail } from '../../lib/ses';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';
import config from '../../../config/app.config';

// Neutral, account-non-revealing response — identical for any email (FR-2, AC-2/3).
const NEUTRAL_MESSAGE = 'Если такой email зарегистрирован, мы отправили инструкции.';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RL_WINDOW_SEC = 3600;        // hourly rate-limit window
const RL_MIN_INTERVAL_SEC = 60;    // no more than once per 60s

/**
 * Sliding-window rate limit keyed on email (FR-6). Client IP is unreliable behind
 * CloudFront, so we cap per email — closing email flooding / Resend abuse.
 * Returns false when the request should be silently dropped (no email sent).
 */
async function allowRequest(email: string): Promise<boolean> {
  const nowSec = Math.floor(Date.now() / 1000);
  const rl = await getItem(MAIN, { PK: `RESET#${email}`, SK: 'RL' });

  let count: number;
  let windowStart: number;

  if (!rl || (rl.windowStart as number) < nowSec - RL_WINDOW_SEC) {
    // Fresh window.
    count = 1;
    windowStart = nowSec;
  } else {
    if (rl.lastAt && nowSec - (rl.lastAt as number) < RL_MIN_INTERVAL_SEC) return false;
    count = (rl.count as number) + 1;
    windowStart = rl.windowStart as number;
    if (count > config.auth.resetRateLimitPerHour) return false;
  }

  await putItem(MAIN, {
    PK:          `RESET#${email}`,
    SK:          'RL',
    count,
    windowStart,
    lastAt:      nowSec,
    ttl:         windowStart + RL_WINDOW_SEC,
  });
  return true;
}

/** All side-effecting work; only runs for an existing, verified, non-throttled user. */
async function processReset(email: string): Promise<void> {
  const lookup = await getItem(MAIN, { PK: `EMAIL#${email}`, SK: 'USER' });
  if (!lookup) return;

  const profile = await getItem(MAIN, { PK: `USER#${lookup.userId}`, SK: 'PROFILE' });
  if (!profile || profile.emailVerified !== true) return;

  if (!(await allowRequest(email))) return;

  const code = generateNumericCode(config.auth.resetCodeLength);
  const ttl = Math.floor(Date.now() / 1000) + config.auth.resetCodeTtlMin * 60;

  // Store only the SHA-256 hash of the code — the plaintext secret never lands in
  // the DB/dumps/logs (FR-16, AC-13). Overwrite invalidates any prior code (FR-5).
  await putItem(MAIN, {
    PK:         `RESET#${email}`,
    SK:         'CODE',
    codeHash:   sha256(code),
    ttl,
    attempts:   0,
    userId:     lookup.userId,
    created_at: new Date().toISOString(),
  });

  await sendEmail({
    to:      email,
    subject: 'Сброс пароля — Relationship Diary',
    html:    `<p>Привет!</p><p>Код для сброса пароля: <strong>${code}</strong></p><p>Код действует ${config.auth.resetCodeTtlMin} минут. Если вы не запрашивали сброс — просто проигнорируйте это письмо.</p>`,
    text:    `Код для сброса пароля: ${code}`,
  });
}

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const started = Date.now();

  const { email } = JSON.parse(event.body ?? '{}');
  if (!email) throw new HttpError(400, 'Missing required fields');

  const normalizedEmail = String(email).trim().toLowerCase();

  // No early returns by branch (anti-enumeration). Errors are swallowed/logged so
  // they neither leak account state nor break constant timing.
  try {
    await processReset(normalizedEmail);
  } catch (err) {
    console.error('request-reset failed:', err instanceof Error ? err.message : 'unknown error');
  }

  // Constant-time response floor (FR-2, AC-3): pad every branch up to the floor.
  const elapsed = Date.now() - started;
  if (elapsed < config.auth.resetResponseFloorMs) {
    await sleep(config.auth.resetResponseFloorMs - elapsed);
  }

  return ok({ message: NEUTRAL_MESSAGE });
});

export { handler };
