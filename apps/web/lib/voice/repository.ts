import "server-only";
import { pool } from "@/lib/db";

/** Database access for voices and consent. Every query is parameterised and scoped by user_id. */

export interface VoiceProfile {
  provider: string;
  providerVoiceId: string;
  readingLanguage: "en" | "ur";
  sampleSeconds: number;
  createdAt: Date;
}

export async function getVoiceProfile(userId: string): Promise<VoiceProfile | null> {
  const { rows } = await pool.query(
    `SELECT provider, provider_voice_id, reading_language, sample_seconds, created_at
       FROM voice_profile WHERE user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    provider: row.provider,
    providerVoiceId: row.provider_voice_id,
    readingLanguage: row.reading_language,
    sampleSeconds: row.sample_seconds,
    createdAt: row.created_at,
  };
}

/** Consents given in the last 24 h = clone attempts; used as a per-user daily limit. */
export async function countRecentConsents(userId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM voice_consent WHERE user_id = $1 AND accepted_at > now() - interval '24 hours'`,
    [userId],
  );
  return rows[0]?.n ?? 0;
}

/** Recorded BEFORE cloning, at the moment the user ticks the box. */
export async function recordConsent(userId: string, version: string, statementSha256: string): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO voice_consent (user_id, statement_version, statement_sha256) VALUES ($1, $2, $3) RETURNING id`,
    [userId, version, statementSha256],
  );
  return rows[0].id;
}

export async function saveVoiceProfile(input: {
  userId: string;
  consentId: string;
  provider: string;
  providerVoiceId: string;
  readingLanguage: "en" | "ur";
  sampleSeconds: number;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO voice_profile (user_id, provider, provider_voice_id, reading_language, sample_seconds)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.userId, input.provider, input.providerVoiceId, input.readingLanguage, input.sampleSeconds],
    );
    await client.query(`UPDATE voice_consent SET voice_profile_id = $1 WHERE id = $2 AND user_id = $3`, [
      rows[0].id,
      input.consentId,
      input.userId,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Removes the voice and marks its consents revoked (the consent records themselves are kept). */
export async function removeVoiceProfile(userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM voice_profile WHERE user_id = $1`, [userId]);
    await client.query(`UPDATE voice_consent SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
