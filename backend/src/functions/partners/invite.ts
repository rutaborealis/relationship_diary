import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { MAIN, getItem, putItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { sendEmail } from '../../lib/ses';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';
import config from '../../../config/app.config';

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const { userId: partnerUserId, partnerEmail } = JSON.parse(event.body ?? '{}');

  const me = await getItem(MAIN, { PK: `USER#${userId}`, SK: 'PROFILE' });
  if (!me) throw new HttpError(404, 'User not found');
  if (me.partnerId) throw new HttpError(409, 'You already have a partner');

  let targetEmail: string;
  let targetUserId: string;

  if (partnerUserId) {
    const target = await getItem(MAIN, { PK: `USER#${partnerUserId}`, SK: 'PROFILE' });
    if (!target) throw new HttpError(404, 'User not found');
    if (target.userId === userId) throw new HttpError(400, 'Cannot invite yourself');
    targetUserId = target.userId as string;
    targetEmail = target.email as string;
  } else if (partnerEmail) {
    const normalizedEmail = partnerEmail.trim().toLowerCase();
    const emailLookup = await getItem(MAIN, { PK: `EMAIL#${normalizedEmail}`, SK: 'USER' });
    if (!emailLookup) throw new HttpError(404, 'User with this email not found');
    if (emailLookup.userId === userId) throw new HttpError(400, 'Cannot invite yourself');
    targetUserId = emailLookup.userId as string;
    targetEmail = normalizedEmail;
  } else {
    throw new HttpError(400, 'Missing partnerUserId or partnerEmail');
  }

  const token = uuidv4();
  const ttl = Math.floor(Date.now() / 1000) + config.auth.inviteTokenTtlHours * 3600;

  await putItem(MAIN, {
    PK:             `INVITE#${token}`,
    SK:             'META',
    token,
    senderId:       userId,
    senderName:     me.name as string,
    recipientEmail: targetEmail,
    recipientId:    targetUserId,
    status:         'pending',
    ttl,
    created_at:     new Date().toISOString(),
  });

  const inviteUrl = `${config.app.domain}/?token=${token}`;

  await sendEmail({
    to:      targetEmail,
    subject: `${me.name} приглашает тебя в Relationship Diary`,
    html:    `<p>${me.name} хочет вести совместный дневник с тобой.</p><p><a href="${inviteUrl}">Принять приглашение</a></p><p>Ссылка действует ${config.auth.inviteTokenTtlHours} часов.</p>`,
    text:    `${me.name} приглашает тебя: ${inviteUrl}`,
  });

  return ok({ message: 'Invitation sent' });
});

export { handler };
