import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, putItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';

const ALLOWED_FIELDS = new Set([
  'mood_level', 'mood_text',
  'noticed_1', 'noticed_2', 'noticed_3', 'noticed_4', 'noticed_5',
  'gratitude_1', 'gratitude_2', 'gratitude_3', 'gratitude_4', 'gratitude_5', 'gratitude_said',
  'closeness_text', 'note_to_partner', 'free_thought',
]);

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const body = JSON.parse(event.body ?? '{}');
  const date: string = body.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Missing or invalid date');

  const entry: Record<string, unknown> = {
    PK:         `USER#${userId}`,
    SK:         `ENTRY#${date}`,
    user_id:    userId,
    date,
    updated_at: new Date().toISOString(),
  };

  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) entry[k] = v;
  }

  // Preserve saved_at on first save only
  entry.saved_at = body.saved_at || new Date().toISOString();

  await putItem(MAIN, entry);
  return ok({ ok: true });
});

export { handler };
