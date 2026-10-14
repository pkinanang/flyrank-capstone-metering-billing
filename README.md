# Flyrank AI Metering & Subscription Billing Engine

A multi-tenant, high-throughput AI usage metering, quota enforcement, and Stripe subscription billing engine built with Node.js, Express, and PostgreSQL.

This project implements an end-to-end usage-based billing platform designed for generative AI services, providing fine-grained token counting, dynamic pricing, hard quota enforcement, idempotency guarantees, and real-time Stripe subscription synchronization.

---

## Architecture Overview

```
                      +---------------------------------------+
                      |             Client Request            |
                      +-------------------+-------------------+
                                          |
                        [X-Tenant-ID] / [Idempotency-Key]
                                          v
                      +---------------------------------------+
                      |         Express Middleware            |
                      |  (tenantMiddleware, express.raw/json) |
                      +-------------------+-------------------+
                                          |
            +-----------------------------+-----------------------------+
            |                                                           |
            v                                                           v
+-----------------------+                                   +-----------------------+
|  Usage & Simulation   |                                   |  Stripe Webhooks      |
|  (/generate, /usage)  |                                   |  (/webhooks/stripe)   |
+-----------+-----------+                                   +-----------+-----------+
            |                                                           |
  [Row-Level Lock]                                            [Signature Verification]
            |                                                           |
            v                                                           v
+-----------------------------------------------------------------------------------+
|                            PostgreSQL 16 Engine                                   |
|  * tenants                 * plans                   * subscriptions              |
|  * usage_events            * idempotency_records     * webhook_events             |
+-----------------------------------------------------------------------------------+
```

---

## Core Capabilities

- **Multi-Tenant Isolation**: Header-driven tenant context (`X-Tenant-ID`) validated across all data access layers.
- **Idempotency & Replay Protection**: Two-layer deduplication protecting both billing generation calls and Stripe webhook events against duplicate processing and network retries.
- **Granular Token Metering & Cost Tracking**:
  - Deterministic input and output token counting.
  - Per-million rate calculations (`input_price_per_million`, `output_price_per_million`).
  - High-precision financial cost tracking stored as `NUMERIC(14, 8)`.
- **Hard Quota Enforcement**: Real-time calendar-month quota aggregation (`date_trunc('month', NOW())`) that rejects over-limit requests with HTTP 429 before recording usage.
- **Concurrency & Race Condition Control**: PostgreSQL row locks (`FOR UPDATE OF s`) and atomic unique constraints prevent double-counting under concurrent load.
- **Stripe Subscription Lifecycle Synchronization**: Secure webhook listener (`HMAC SHA-256`) syncing subscription status (`active`, `canceled`), plan tiers, and billing periods into PostgreSQL.

---

## Project Structure

```text
.
├── capstone.yml                 # Automation and grading endpoint manifest
├── docker-compose.yml           # PostgreSQL service configuration
├── EVIDENCE.md                  # Test runs and database verification evidence
├── migrations/
│   └── usage_metering.sql       # Phase 4 schema evolution migration
├── db/
│   └── init.sql                 # Complete database schema and seed data
├── src/
│   ├── app.js                   # Express application setup and route mounting
│   ├── server.js                # HTTP server bootstrap
│   ├── config/
│   │   ├── database.js          # PostgreSQL Pool configuration (supports DATABASE_URL)
│   │   ├── db.js                # Database pool export alias
│   │   └── stripe.js            # Stripe SDK client initialization
│   ├── middleware/
│   │   └── tenant.middleware.js # Multi-tenant header validation middleware
│   ├── repositories/
│   │   ├── billing.repository.js# Subscription and plan query layer
│   │   ├── tenant.repository.js # Tenant and subscription lookup
│   │   └── usage.repository.js  # Usage event and idempotency persistence
│   ├── routes/
│   │   ├── billing.routes.js    # Stripe Checkout session creation
│   │   ├── generate.routes.js   # Phase 2 metered AI generation endpoint
│   │   ├── health.routes.js     # Service health checks
│   │   ├── stripe-webhook.routes.js # Stripe webhook listener & idempotency
│   │   └── usage.routes.js      # Usage simulation & quota status
│   └── services/
│       ├── metering.service.js  # Phase 2 idempotency & quota service
│       ├── quota.service.js     # Quota boundary validation logic
│       ├── stripe.service.js    # Stripe Checkout session manager
│       ├── token-simulator.service.js # Deterministic token estimation engine
│       └── usage.service.js     # Phase 4 token cost and usage recorder
└── tests/
    ├── helpers/                 # Database truncate and seed helpers
    ├── metering.integration.test.js    # Phase 2 idempotency integration tests
    ├── quota.service.test.js           # Unit tests for quota thresholds
    ├── stripe-webhook.integration.test.js # Phase 3 webhook integration tests
    └── usage.integration.test.js       # Phase 4 token metering integration tests
```

---

## API Endpoints

| Method | Path | Description | Required Headers |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Service health status | None |
| `GET` | `/usage` | Get current monthly quota consumption & limits | `X-Tenant-ID` |
| `POST` | `/usage/simulate` | Simulate AI generation, meter tokens & compute cost | `X-Tenant-ID`, `Idempotency-Key` |
| `POST` | `/generate` | Legacy metered AI generation endpoint | `X-Tenant-ID`, `Idempotency-Key` |
| `POST` | `/billing/checkout` | Create Stripe Checkout upgrade session | `Content-Type: application/json` |
| `POST` | `/webhooks/stripe` | Handle Stripe subscription webhooks | `Stripe-Signature` |

### Sample Usage Request

```bash
curl -X POST http://localhost:3000/usage/simulate \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: 437f8030-be8d-4e4b-b8bb-91bf3434e697" \
  -H "Idempotency-Key: request-001" \
  -d '{"prompt": "Explain subscription billing mechanisms."}'
```

**Response (HTTP 200)**:
```json
{
  "success": true,
  "duplicate": false,
  "outputText": "Simulated response: Explain subscription billing mechanisms.",
  "usage": {
    "id": "922dc095-571b-487d-a54d-4732f5dbc6b2",
    "tenant_id": "437f8030-be8d-4e4b-b8bb-91bf3434e697",
    "subscription_id": "fa82e806-8f3b-47da-8980-ee0d0674d91c",
    "input_tokens": 12,
    "output_tokens": 17,
    "total_tokens": 29,
    "input_cost": "0.00001200",
    "output_cost": "0.00005100",
    "total_cost": "0.00006300"
  },
  "quota": {
    "usedTokens": 29,
    "tokenLimit": 100000,
    "remainingTokens": 99971
  }
}
```

---

## Getting Started

### Prerequisites

- **Node.js**: v18+ (tested on Node.js 20+)
- **Docker & Docker Compose**
- **Stripe CLI** *(optional, for local webhook forwarding)*

### 1. Environment Configuration

Copy the example environment configuration:

```bash
cp .env.example .env
```

Ensure `.env` contains:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5433
DB_NAME=metering_db
DB_USER=user
DB_PASSWORD=password
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

For test execution, `.env.test` isolates test variables to the test database:

```env
DATABASE_URL=postgresql://user:password@localhost:5433/metering_billing_test
DB_PORT=5433
NODE_ENV=test
```

### 2. Start PostgreSQL Container

```bash
docker compose up -d
```

*Note: The container maps host port `5433` to PostgreSQL container port `5432` to avoid conflicts with any local system PostgreSQL instances.*

### 3. Install Dependencies & Start Server

```bash
npm install
npm run dev
```

The server will start on `http://localhost:3000`.

---

## Running Automated Tests

Run the full integration test suite:

```bash
npm test
```

Or run individual test suites:

```bash
# Phase 2 Idempotency Integration Tests
npx jest --runInBand tests/metering.integration.test.js

# Phase 3 Stripe Webhook Synchronization Tests
npx jest --runInBand tests/stripe-webhook.integration.test.js

# Phase 4 Token Metering & Cost Tracking Tests
npx jest --runInBand tests/usage.integration.test.js
```

---

## Implementation Phases

- **Phase 1 — Foundations**: Multi-tenant database schema, connection pooling, and health check route.
- **Phase 2 — Idempotent Usage Metering**: Atomic request deduplication and concurrent retry handling via `idempotency_records`.
- **Phase 3 — Stripe Webhook Synchronization**: Cryptographically validated webhook listener syncing subscription upgrades and cancellations.
- **Phase 4 — Token Pricing & Quota Enforcement**: Granular input/output token simulation, cost tracking, and monthly quota enforcement.
