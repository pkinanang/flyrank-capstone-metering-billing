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
