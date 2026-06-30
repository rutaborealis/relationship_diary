/**
 * Content encryption at rest — envelope encryption isolated in one library.
 *
 * Model (ADR 0001 / 02-spec.md): a single KMS CMK wraps a symmetric data key
 * (DEK); the actual content is encrypted *locally* with AES-256-GCM so KMS is
 * not called per field. The plaintext DEK is cached in the warm container
 * (encrypt side) and by its wrapped bytes (decrypt side) so a whole entry of
 * ~14 fields costs at most one KMS call.
 *
 * Each encrypted field is stored as a DynamoDB Map `{ enc_v, iv, tag, ct, dk }`:
 *   - enc_v  number  — schema version (1 = KMS-envelope + AES-256-GCM)
 *   - iv     base64  — 12-byte GCM nonce (fresh per field, never reused)
 *   - tag    base64  — 16-byte GCM auth tag
 *   - ct     base64  — ciphertext
 *   - dk     base64  — wrapped (KMS-encrypted) data key
 *
 * Detection rules:
 *   - empty / null / undefined            → passthrough (never becomes a Map)
 *   - plain String without `enc_v`        → legacy plaintext, returned as-is
 *   - Map with `enc_v`                    → decrypt
 *
 * Local mode ("fake KMS") wraps the DEK with a local master key instead of KMS
 * so the full stack runs on DynamoDB Local without AWS. The field crypto is
 * identical to prod — only DEK wrap/unwrap differs.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import config from '../../config/app.config';

const ENC_V = 1;

export interface EncBlob {
  enc_v: number;
  iv: string;
  tag: string;
  ct: string;
  dk: string;
}

/** Single source of truth for the encrypted content fields of a diary entry. */
export const ENCRYPTED_ENTRY_FIELDS = [
  'mood_text',
  'noticed_1', 'noticed_2', 'noticed_3', 'noticed_4', 'noticed_5',
  'gratitude_1', 'gratitude_2', 'gratitude_3', 'gratitude_4', 'gratitude_5',
  'closeness_text', 'note_to_partner', 'free_thought',
] as const;

// ── Envelope backend (KMS in prod, local master key in dev) ─────────────────

interface GeneratedDataKey {
  plaintext: Buffer; // 32-byte DEK in the clear
  wrapped:   string; // base64 of the encrypted DEK
}

interface EnvelopeBackend {
  generateDataKey(): Promise<GeneratedDataKey>;
  unwrapDataKey(wrapped: string): Promise<Buffer>;
}

/** Production envelope: KMS CMK wraps the DEK. AWS SDK provided by the runtime. */
function kmsBackend(): EnvelopeBackend {
  // Lazy require keeps local dev from needing AWS creds / KMS reachability.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { KMSClient, GenerateDataKeyCommand, DecryptCommand } = require('@aws-sdk/client-kms');
  const client = new KMSClient({ region: config.aws.region });
  const KeyId = config.crypto.kmsKeyId;

  return {
    async generateDataKey() {
      if (!KeyId) throw new Error('KMS_KEY_ID is not configured');
      const res = await client.send(new GenerateDataKeyCommand({ KeyId, KeySpec: 'AES_256' }));
      return {
        plaintext: Buffer.from(res.Plaintext as Uint8Array),
        wrapped:   Buffer.from(res.CiphertextBlob as Uint8Array).toString('base64'),
      };
    },
    async unwrapDataKey(wrapped: string) {
      const res = await client.send(new DecryptCommand({
        KeyId,
        CiphertextBlob: Buffer.from(wrapped, 'base64'),
      }));
      return Buffer.from(res.Plaintext as Uint8Array);
    },
  };
}

/**
 * Local "fake KMS": wrap the DEK with a local 32-byte master key via AES-256-GCM.
 * The wrapped blob packs iv(12) | tag(16) | ciphertext, base64-encoded.
 */
function localBackend(): EnvelopeBackend {
  const DEFAULT_DEV_KEY = 'diary-local-dev-master-key-do-not-use-in-prod';
  const masterKey = createHash('sha256')
    .update(config.crypto.localMasterKey || DEFAULT_DEV_KEY)
    .digest(); // always 32 bytes regardless of input format

  return {
    async generateDataKey() {
      const plaintext = randomBytes(32);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
      const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const wrapped = Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
      return { plaintext, wrapped };
    },
    async unwrapDataKey(wrapped: string) {
      const buf = Buffer.from(wrapped, 'base64');
      const iv  = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const ct  = buf.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]);
    },
  };
}

const backend: EnvelopeBackend = config.crypto.localMode ? localBackend() : kmsBackend();

// ── DEK caches ───────────────────────────────────────────────────────────────

interface CachedEncDek extends GeneratedDataKey {
  expiresAt: number;
  uses:      number;
}

let encDek: CachedEncDek | null = null;

/** Encrypt side: reuse one DEK across fields/saves until TTL or use-cap. */
async function getEncryptDek(): Promise<CachedEncDek> {
  const now = Date.now();
  if (encDek && now < encDek.expiresAt && encDek.uses < config.crypto.dataKeyMaxUses) {
    encDek.uses += 1;
    return encDek;
  }
  const fresh = await backend.generateDataKey();
  encDek = { ...fresh, expiresAt: now + config.crypto.dataKeyTtlMs, uses: 1 };
  return encDek;
}

// Decrypt side: plaintext DEKs keyed by their wrapped (base64) blob. A whole
// entry shares one `dk` → 1 unwrap + N cache hits.
const decDekCache = new Map<string, Buffer>();
const DEC_CACHE_MAX = 1_000;

async function getDecryptDek(wrapped: string): Promise<Buffer> {
  const hit = decDekCache.get(wrapped);
  if (hit) return hit;
  const dek = await backend.unwrapDataKey(wrapped);
  if (decDekCache.size >= DEC_CACHE_MAX) decDekCache.clear();
  decDekCache.set(wrapped, dek);
  return dek;
}

// ── Field crypto (AES-256-GCM) ───────────────────────────────────────────────

function isEncBlob(v: unknown): v is EncBlob {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as EncBlob).enc_v === 'number' &&
    typeof (v as EncBlob).iv === 'string' &&
    typeof (v as EncBlob).tag === 'string' &&
    typeof (v as EncBlob).ct === 'string' &&
    typeof (v as EncBlob).dk === 'string'
  );
}

/**
 * Encrypt one content value. Empty/null/undefined pass through unchanged so the
 * "no value" semantics are preserved (FR-4) — they never become a non-empty
 * ciphertext Map. Non-empty values become an `EncBlob`.
 */
export async function encryptField(
  plain: unknown,
): Promise<EncBlob | string | null | undefined> {
  if (plain === null || plain === undefined || plain === '') {
    return plain as null | undefined | string;
  }
  const text = typeof plain === 'string' ? plain : String(plain);
  const dek = await getEncryptDek();

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dek.plaintext, iv);
  const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

  return {
    enc_v: ENC_V,
    iv:    iv.toString('base64'),
    tag:   cipher.getAuthTag().toString('base64'),
    ct:    ct.toString('base64'),
    dk:    dek.wrapped,
  };
}

/**
 * Decrypt one stored value:
 *   - string  → legacy plaintext, returned as-is (FR-9)
 *   - EncBlob → decrypt (FR-5)
 *   - null/undefined → passthrough
 *   - anything else / decrypt failure → null, logged without content (FR-12/FR-13)
 */
export async function decryptField(stored: unknown): Promise<string | null> {
  if (stored === null || stored === undefined) return stored ?? null;
  if (typeof stored === 'string') return stored;
  if (!isEncBlob(stored)) return null;

  if (stored.enc_v !== ENC_V) {
    console.error({ event: 'decrypt_failed', reason: 'unknown_version', enc_v: stored.enc_v });
    return null;
  }

  try {
    const dek = await getDecryptDek(stored.dk);
    const decipher = createDecipheriv('aes-256-gcm', dek, Buffer.from(stored.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(stored.tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(stored.ct, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    // Never log content or ciphertext — metadata only.
    console.error({ event: 'decrypt_failed', reason: 'crypto_error', enc_v: stored.enc_v });
    return null;
  }
}
