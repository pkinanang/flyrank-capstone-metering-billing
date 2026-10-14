-- Migration: Usage Metering & Cost Tracking
-- Illustrative test rates: $1.00 / M input tokens, $3.00 / M output tokens

-- 1. Extend plans with token pricing and monthly limit
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS monthly_token_limit BIGINT DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS input_price_per_million NUMERIC(12, 6) NOT NULL DEFAULT 1.000000,
  ADD COLUMN IF NOT EXISTS output_price_per_million NUMERIC(12, 6) NOT NULL DEFAULT 3.000000;

-- Sync monthly_token_limit with existing ai_token_limit
UPDATE plans
SET monthly_token_limit = ai_token_limit
WHERE monthly_token_limit IS NULL OR (monthly_token_limit = 100000 AND ai_token_limit != 100000);

-- 2. Extend existing usage_events table (UUID-compatible, preserving existing rows)
ALTER TABLE usage_events
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS input_tokens BIGINT DEFAULT 0 CHECK (input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS output_tokens BIGINT DEFAULT 0 CHECK (output_tokens >= 0),
  ADD COLUMN IF NOT EXISTS total_tokens BIGINT DEFAULT 0 CHECK (total_tokens >= 0),
  ADD COLUMN IF NOT EXISTS input_cost NUMERIC(14, 8) DEFAULT 0.00000000,
  ADD COLUMN IF NOT EXISTS output_cost NUMERIC(14, 8) DEFAULT 0.00000000,
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(14, 8) DEFAULT 0.00000000;

-- 3. Query performance indexes
CREATE INDEX IF NOT EXISTS usage_events_tenant_created_idx
  ON usage_events (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS subscriptions_tenant_status_idx
  ON subscriptions (tenant_id, status);