-- ScamGuard Postgres schema
-- Run via: npm run migrate (or psql $DATABASE_URL -f schema.sql)

CREATE TABLE IF NOT EXISTS users (
  uuid                    UUID PRIMARY KEY,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 'premium' = paid subscription (managed by future billing webhooks).
  -- Earned premium days are tracked separately and only consumed while tier = 'free'.
  tier                    TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  premium_days_remaining  INTEGER NOT NULL DEFAULT 0 CHECK (premium_days_remaining >= 0),
  daily_checks_used       INTEGER NOT NULL DEFAULT 0,
  daily_checks_reset_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Tracks which UTC day we last consumed an earned premium day for
  premium_day_consumed_on DATE
);

CREATE TABLE IF NOT EXISTS reports (
  id         BIGSERIAL PRIMARY KEY,
  domain     TEXT NOT NULL,
  verdict    TEXT NOT NULL CHECK (verdict IN ('scam', 'safe', 'suspicious')),
  comment    TEXT,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_uuid  UUID NOT NULL REFERENCES users(uuid),
  -- One report per user per domain; re-reporting updates the verdict instead
  UNIQUE (user_uuid, domain)
);

CREATE INDEX IF NOT EXISTS idx_reports_domain ON reports (domain);

CREATE TABLE IF NOT EXISTS domain_cache (
  domain     TEXT PRIMARY KEY,
  result     JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_domain_cache_expires ON domain_cache (expires_at);

-- Records (user, domain) pairs already awarded a premium day, so a report
-- can never be credited twice no matter how many corroborations arrive.
CREATE TABLE IF NOT EXISTS contributor_credits (
  user_uuid  UUID NOT NULL REFERENCES users(uuid),
  domain     TEXT NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_uuid, domain)
);

CREATE INDEX IF NOT EXISTS idx_credits_user_time ON contributor_credits (user_uuid, awarded_at);

-- Review queue for domains where the community corroboration threshold was
-- hit. 'confirmed' = external sources or a human validated the scam claim
-- (credits paid, community verdict may assert scam). 'pending_review' =
-- awaiting validation. 'rejected' = looked like brigading / bad-faith
-- reporting; no credits, community signal ignored for this domain.
CREATE TABLE IF NOT EXISTS domain_flags (
  domain      TEXT PRIMARY KEY,
  verdict     TEXT NOT NULL CHECK (verdict IN ('scam', 'suspicious')),
  status      TEXT NOT NULL CHECK (status IN ('confirmed', 'pending_review', 'rejected')),
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
