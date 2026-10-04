CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create Plans
CREATE TABLE IF NOT EXISTS plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    ai_token_limit BIGINT NOT NULL,
    api_calls_limit INTEGER NOT NULL,
    monthly_price INTEGER NOT NULL DEFAULT 0,
    stripe_price_id VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Tenants
CREATE TABLE IF NOT EXISTS tenants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    stripe_customer_id VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    stripe_subscription_id VARCHAR(255),
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Idempotency Records Table
CREATE TABLE IF NOT EXISTS idempotency_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(255) NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_idempotency_key UNIQUE(tenant_id, idempotency_key)
);

-- Usage Events Table
CREATE TABLE IF NOT EXISTS usage_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    usage_type VARCHAR(50) NOT NULL,
    quantity BIGINT NOT NULL,
    idempotency_key VARCHAR(255),
    request_id UUID REFERENCES idempotency_records(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Webhook Events Table
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant ON usage_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_type ON usage_events(tenant_id, usage_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);

-- Seed Free and Pro plan
INSERT INTO plans (
    name,
    api_calls_limit,
    ai_token_limit,
    monthly_price
)
VALUES
(
    'Free',
    1000,
    100000,
    0
),
(
    'Pro',
    10000,
    1000000,
    2900
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO tenants (
    name
)
VALUES
(
    'Demo Company'
)
ON CONFLICT DO NOTHING;

INSERT INTO subscriptions (
    tenant_id,
    plan_id,
    status
)
SELECT
    t.id,
    p.id,
    'active'
FROM tenants t
JOIN plans p ON p.name = 'Free'
WHERE t.name = 'Demo Company'
AND NOT EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id AND s.plan_id = p.id
);