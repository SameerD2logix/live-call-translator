-- Words each user wants kept exactly as they are (product names, technical terms).
-- At most 50 per user (enforced in the API; also ElevenLabs' keyterm limit).
CREATE TABLE IF NOT EXISTS glossary_term (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  term       text        NOT NULL CHECK (char_length(term) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One copy of each term per user, ignoring case ("API" and "api" are the same term).
CREATE UNIQUE INDEX IF NOT EXISTS glossary_term_user_term_idx ON glossary_term (user_id, lower(term));
