import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MAIN, getItem } from '../../lib/dynamo';
import { requireAuth } from '../../lib/auth-middleware';
import { ok, HttpError, withErrorHandling } from '../../lib/errors';
import { decryptField, ENCRYPTED_ENTRY_FIELDS } from '../../lib/crypto';

// free_thought is private — never decrypted for the partner (it is also stripped
// from the partner response below). The partner sees every other content field.
const PARTNER_VISIBLE_FIELDS = ENCRYPTED_ENTRY_FIELDS.filter((f) => f !== 'free_thought');

// Decrypt the given content fields in place. Each field is decrypted
// independently so one corrupt/undecryptable field cannot drop the whole entry
// (FR-12); legacy plaintext passes through unchanged (FR-9).
async function decryptEntryFields(
  entry: Record<string, unknown>,
  fields: readonly string[],
): Promise<void> {
  await Promise.all(
    fields.map(async (field) => {
      if (field in entry) entry[field] = await decryptField(entry[field]);
    }),
  );
}

const handler = withErrorHandling(async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = await requireAuth(event);
  const date = event.queryStringParameters?.date;
  if (!date) throw new HttpError(400, 'Missing date');

  const me = await getItem(MAIN, { PK: `USER#${userId}`, SK: 'PROFILE' });

  const [myEntry, partnerEntry] = await Promise.all([
    getItem(MAIN, { PK: `USER#${userId}`, SK: `ENTRY#${date}` }),
    me?.partnerId
      ? getItem(MAIN, { PK: `USER#${me.partnerId}`, SK: `ENTRY#${date}` })
      : Promise.resolve(null),
  ]);

  const stripKeys = (e: Record<string, unknown> | null): Record<string, unknown> | null =>
    e ? { ...e, PK: undefined, SK: undefined } : null;

  // Own entry: keep everything (including private free_thought + draft status).
  const mine = stripKeys(myEntry as Record<string, unknown> | null);
  if (mine) await decryptEntryFields(mine, ENCRYPTED_ENTRY_FIELDS);

  // Partner entry: free_thought is private, and unsent drafts (shared === false)
  // must stay hidden so only the final version reaches the partner. Legacy
  // entries without a `shared` flag are treated as shared (always visible).
  let theirs = stripKeys(partnerEntry as Record<string, unknown> | null);
  if (theirs) {
    theirs = theirs.shared === false ? null : { ...theirs, free_thought: undefined };
  }
  // Decrypt only partner-visible fields; free_thought is never decrypted here.
  if (theirs) await decryptEntryFields(theirs, PARTNER_VISIBLE_FIELDS);

  return ok({ entry: mine, partnerEntry: theirs });
});

export { handler };
