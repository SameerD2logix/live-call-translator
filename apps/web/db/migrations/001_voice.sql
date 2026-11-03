-- Voice clones and the consent behind them.
-- Better Auth creates "user", "session", "account", "verification", "twoFactor" and "rateLimit"
-- first (see scripts/migrate.mjs); these tables reference "user"(id).

-- One voice per user. We store only the provider's voice id, never the recordings.
CREATE TABLE IF NOT EXISTS voice_profile (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text        NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  provider          text        NOT NULL,
  provider_voice_id text        NOT NULL UNIQUE,
  reading_language  text        NOT NULL CHECK (reading_language IN ('en', 'ur')),
  sample_seconds    integer     NOT NULL CHECK (sample_seconds BETWEEN 30 AND 600),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Proof of consent: which statement (version + SHA-256 of its exact text), and when.
-- Kept when the voice is deleted (revoked_at is set); removed with the account.
CREATE TABLE IF NOT EXISTS voice_consent (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  statement_version text        NOT NULL,
  statement_sha256  char(64)    NOT NULL,
  accepted_at       timestamptz NOT NULL DEFAULT now(),
  voice_profile_id  uuid        REFERENCES voice_profile(id) ON DELETE SET NULL,
  revoked_at        timestamptz
);

CREATE INDEX IF NOT EXISTS voice_consent_user_accepted_idx ON voice_consent (user_id, accepted_at DESC);
