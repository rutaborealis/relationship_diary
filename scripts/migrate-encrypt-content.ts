/**
 * One-off, idempotent backfill: encrypt legacy plaintext content fields in
 * DiaryMain (diary entries + qualities). Already-encrypted fields (Map with
 * `enc_v`) are skipped, so re-running is safe (FR-11 / AC-8).
 *
 * Targets:
 *   - SK begins_with `ENTRY#`   → ENCRYPTED_ENTRY_FIELDS
 *   - SK begins_with `QUALITY#` → `text`
 *
 * Modes (selected by lib/crypto via app.config, same as the running app):
 *   - local: `KMS_LOCAL=1 LOCAL_ENC_KEY=... DYNAMO_ENDPOINT=http://localhost:8000`
 *   - prod:  AWS creds + `KMS_KEY_ID` (CMK), no DYNAMO_ENDPOINT
 *
 * Usage:
 *   ts-node scripts/migrate-encrypt-content.ts [--dry-run]
 *
 * NOTE: running this against production data mutates production data and is
 * gated by [NEEDS-CEO-APPROVAL] at the DEPLOY stage. Verify on DynamoDB Local
 * first. Lazy on-write migration covers new/re-saved records without this run.
 */
import 'dotenv/config';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { db, MAIN, updateItem } from '../backend/src/lib/dynamo';
import { encryptField, ENCRYPTED_ENTRY_FIELDS } from '../backend/src/lib/crypto';

const DRY_RUN = process.argv.includes('--dry-run');

function fieldsFor(sk: string): readonly string[] | null {
  if (sk.startsWith('ENTRY#'))   return ENCRYPTED_ENTRY_FIELDS;
  if (sk.startsWith('QUALITY#')) return ['text'];
  return null;
}

// A value still needs encryption only if it's a non-empty plaintext string.
// Already-encrypted Maps (and empty/null) are left untouched → idempotent.
function needsEncryption(v: unknown): v is string {
  return typeof v === 'string' && v !== '';
}

async function main() {
  console.log(`migrate-encrypt-content: table=${MAIN} dryRun=${DRY_RUN}`);
  let scanned = 0;
  let updatedItems = 0;
  let encryptedFields = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const res = await db.send(new ScanCommand({
      TableName: MAIN,
      ExclusiveStartKey: lastKey,
    }));
    const items = res.Items ?? [];

    for (const item of items) {
      scanned += 1;
      const sk = String(item.SK ?? '');
      const fields = fieldsFor(sk);
      if (!fields) continue;

      const updates: Record<string, unknown> = {};
      for (const field of fields) {
        if (needsEncryption(item[field])) {
          updates[field] = await encryptField(item[field]);
          encryptedFields += 1;
        }
      }

      if (Object.keys(updates).length === 0) continue;
      updatedItems += 1;
      if (DRY_RUN) {
        console.log(`would update ${item.PK} / ${sk}: [${Object.keys(updates).join(', ')}]`);
      } else {
        await updateItem(MAIN, { PK: item.PK, SK: item.SK }, updates);
      }
    }

    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  console.log(
    `done: scanned=${scanned} itemsUpdated=${updatedItems} fieldsEncrypted=${encryptedFields}` +
    (DRY_RUN ? ' (dry-run, no writes)' : ''),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
