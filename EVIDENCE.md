# Phase 2 — Core Billing Logic Evidence

## Test: Idempotent Usage Metering

### Scenario

The same billable request was sent twice using the same:

* Tenant ID
* Idempotency Key
* Request body

### Request

Idempotency-Key:

`test-request-001`

### Expected Result

The system must:

1. Process the first request.
2. Record one API usage event.
3. Record one AI token usage event.
4. Store the original response.
5. Detect the second request as a duplicate.
6. Return the original response.
7. Not create additional usage events.

### Test Result

```text
PASS tests/metering.integration.test.js

✓ same request with same idempotency key records usage exactly once
✓ concurrent requests with same idempotency key record usage once
```

### Database Verification

```text
API Calls:

Events: 1
Total: 1


AI Tokens:

Events: 1
Total: 1800


Idempotency Records:

Records: 1
```

### Conclusion

The PostgreSQL unique constraint on:

`(tenant_id, idempotency_key)`

combined with database transactions prevents duplicate usage recording.

The same request can be retried without double-counting API usage or AI token usage.

---

# Phase 3 — Stripe Webhook Synchronization Evidence

## Test: Stripe Webhook Synchronization & Idempotency

### Scenario

The webhook endpoint (`/webhooks/stripe`) receives lifecycle events from Stripe signed with HMAC SHA-256 signatures (`Stripe-Signature`):

1. **Valid Event**: A validly signed `customer.subscription.updated` event is received.
2. **Untrusted / Forged Event**: An event with an invalid signature is received.
3. **Duplicate Event (Replay / Retry)**: The same webhook event is delivered multiple times due to network retries.

### Expected Result

The system must:

1. **Verify Signatures**: Accept valid Stripe signatures and reject invalid ones with HTTP 400 without modifying database state.
2. **Synchronize Subscription State**: Extract tenant metadata, map the Stripe price ID to the local plan ID, and atomically upsert the tenant's subscription to `active`.
3. **Guarantee Idempotency**: Record the processed `stripe_event_id` in `webhook_events`. On duplicate delivery, detect the event via the `(stripe_event_id)` unique constraint and return HTTP 200 with `{ received: true, duplicate: true }` without repeating database mutations.

### Test Result

```text
PASS tests/stripe-webhook.integration.test.js
  Stripe webhook integration
    ✓ 1. valid signature returns 200 and updates subscription state (37 ms)
    ✓ 2. invalid signature returns 400 and does not change the database (19 ms)
    ✓ 3. duplicate event is processed once without duplicate effects (27 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

### Database Verification

```text
Valid Event Processing:
- webhook_events: 1 recorded event (evt_valid_phase3)
- subscriptions: 1 active record mapped to tenant and plan (sub_test_phase3)

Invalid Signature Handling:
- webhook_events: 0 records
- subscriptions: 0 records

Duplicate Event Handling:
- First Request: HTTP 200 { received: true }
- Second Request (Retry): HTTP 200 { received: true, duplicate: true }
- webhook_events: 1 record total (no duplicates)
- subscriptions: 1 record total
```

### Conclusion

- The PostgreSQL unique constraint on `webhook_events(stripe_event_id)` combined with `ON CONFLICT DO NOTHING` prevents concurrent race conditions and double-processing of webhook retries.
- The `subscriptions(stripe_subscription_id)` unique constraint ensures state transitions (upgrades, cancellations) update the existing subscription row rather than creating orphan duplicates.
- Cryptographic signature validation protects the system against unauthorized billing tampering.

