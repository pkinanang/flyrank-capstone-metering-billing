# Build Log & Engineering Decision Records

This document tracks key engineering modifications, architectural decisions, and bug fixes applied throughout the development and hardening of the **Flyrank AI Metering & Subscription Billing Engine**.

---

## 1. Containerization & Infrastructure (`docker-compose.yml`)

- **Container Resilience**: Added `restart: unless-stopped` to the PostgreSQL service definition to guarantee that the database container automatically restarts after crashes or host machine reboots.
- **Port Conflict Resolution**: Configured host port forwarding (`5433:5432`) to eliminate port collisions with local macOS Homebrew PostgreSQL services running on default port `5432`.

---

## 2. Database Schema & Indexing (`db/init.sql` & Migrations)

- **Performance Indexing**: Added composite and single-column B-tree indexes to optimize high-frequency lookup queries:
  - `idx_usage_events_tenant` on `usage_events(tenant_id)`
  - `idx_usage_events_tenant_type` on `usage_events(tenant_id, usage_type)`
  - `idx_usage_events_created_at` on `usage_events(created_at)`
  - `usage_events_tenant_created_idx` on `usage_events(tenant_id, created_at)`
  - `subscriptions_tenant_status_idx` on `subscriptions(tenant_id, status)`
- **Constraint Hardening**:
  - `unique_idempotency_key` on `idempotency_records(tenant_id, idempotency_key)`
  - `unique_stripe_subscription_id` on `subscriptions(stripe_subscription_id)`
  - `unique_tenant_plan` on `subscriptions(tenant_id, plan_id)`
  - `webhook_events_stripe_event_id_key` on `webhook_events(stripe_event_id)`
- **Single Source of Truth Migration**: Adapted `migrations/usage_metering.sql` using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to preserve UUID foreign key relationships and backward compatibility with Phase 2 data instead of recreating conflicting tables.

---

## 3. Application Routing & Pipeline (`src/app.js`)

- **Route Import Fixes**: Resolved module import path errors (e.g., corrected `require("./routes/healthRoutes")` to standard kebab-case naming `require("./routes/health.routes")`).
- **Middleware Ordering**: Positioned raw body parser (`express.raw({ type: "application/json" })`) ahead of `express.json()` on webhook routes to preserve cryptographic signature byte integrity.
- **Deduplication & Dual Mounts**:
  - Removed duplicate route mount `app.use("/usage", require("./routes/usage.routes"))`.
  - Mounted webhook routes on both `/webhooks/stripe` and `/stripe-webhooks` for test suite compliance and live webhook forwarding compatibility.

---

## 4. Metered AI Generation Endpoint (`src/routes/generate.routes.js`)

- **Strict Header Validation**: Added explicit checks for `X-Tenant-ID` and `Idempotency-Key` headers before running business logic, returning HTTP 400 when missing.
- **Tenant Existence Verification**: Validated tenant IDs against the database via `tenantRepository.findTenantById()` prior to metering to reject orphaned requests with HTTP 404.
- **Payload Schema Validation (Zod)**: Integrated Zod schema validation for token quantities (`input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_tokens`), enforcing non-negative integer values.
- **Flexible Field Compatibility**: Added support for both plural and singular token parameter conventions in request payloads.

---

## 5. Stripe Webhook Synchronization Refactoring (`src/routes/stripe-webhook.routes.js`)

A comprehensive audit and refactoring was completed to elevate webhook processing to production standards:

| Dimension | My Initial Implementation | Ai Refactored  | Impact & Rationale |
| :--- | :--- | :--- | :--- |
| **Config Import** | `require("../config/db")` | `require("../config/database")` *(with `db.js` alias)* | Standardized configuration imports across the repository. |
| **Duplicate Event Check** | Non-atomic: Two queries (`SELECT` followed by `INSERT`). | Atomic: `INSERT INTO webhook_events ... ON CONFLICT (stripe_event_id) DO NOTHING RETURNING stripe_event_id` | Eliminates race conditions under simultaneous webhook delivery retries. |
| **Transaction Scoping** | Bypassed transaction: called repository using `pool.query()`. | Scoped to active `client` connection inside `BEGIN` / `COMMIT` / `ROLLBACK`. | Guarantees atomic rollback if any event step fails. |
| **Subscription Upsert Target** | `ON CONFLICT (tenant_id, plan_id)` | `ON CONFLICT (stripe_subscription_id)` | Prevents orphan duplicate rows when a tenant switches plan tiers (e.g. Free $\to$ Pro). |
| **Cancellation Status** | `'cancelled'` (double 'l') | `'canceled'` (single 'l') | Conforms strictly to Stripe API standard status conventions. |
| **Signature Error Response** | `{ error: "INVALID_STRIPE_SIGNATURE" }` | `{ error: "Invalid Stripe webhook signature" }` | Standardized descriptive error messaging expected by integration test harness. |
| **Pre-Validation** | Relied purely on `stripe.webhooks.constructEvent` try/catch. | Pre-validates `!webhookSecret \|\| !signature` returning 400. | Fails fast with clear diagnostics when secrets/headers are missing. |
| **Missing Metadata Handling** | Logged warning and returned 200 (skipping processing). | Throws descriptive Error, triggering rollback and HTTP 500. | Allows Stripe automated retries to fire until metadata is resolved. |
| **Handled Events** | Mixed partial implementations with unhandled branches. | Explicit handlers for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. | Ensures full subscription lifecycle state synchronization into PostgreSQL. |

---

## 6. Token Metering, Cost Calculation & Quotas (`src/services/usage.service.js`)

- **Deterministic Simulation**: Built [token-simulator.service.js] to compute deterministic token counts based on prompt length.
- **Dynamic Cost Calculation**: Calculated `input_cost`, `output_cost`, and `total_cost` dynamically based on plan-specific pricing tiers (`input_price_per_million`, `output_price_per_million`).
- **Calendar-Month Quotas**: Enforced monthly quota limits using `date_trunc('month', NOW())` aggregation, rejecting over-quota requests with HTTP 429 before persisting any records.
- **Concurrency Serialization**: Applied PostgreSQL row-level locks (`SELECT ... FOR UPDATE OF s`) to eliminate race conditions during concurrent request retries with the same idempotency key.
- **Type Normalization**: Ensured `total_tokens`, `input_tokens`, and `output_tokens` return as integer Numbers in JSON responses rather than stringified `int8` representations.
