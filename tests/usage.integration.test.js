require("dotenv").config({ path: ".env.test" });

const request = require("supertest");
const app = require("../src/app");
const pool = require("../src/config/db");

let tenantId;

beforeAll(async () => {
    const result = await pool.query("SELECT current_database() AS name");

    if (!result.rows[0].name.endsWith("_test")) {
        throw new Error("Refusing to run against a non-test database");
    }
});

beforeEach(async () => {
    await pool.query(
        `TRUNCATE TABLE usage_events, webhook_events, subscriptions,
     tenants, plans RESTART IDENTITY CASCADE`
    );

    const plan = await pool.query(
        `INSERT INTO plans (
       name,
       stripe_price_id,
       monthly_token_limit,
       input_price_per_million,
       output_price_per_million
     )
     VALUES ('Test Plan', 'price_usage_test', 10000, 1, 3)
     RETURNING id`
    );

    const tenant = await pool.query(
        `INSERT INTO tenants (name, stripe_customer_id)
     VALUES ('Usage Test Tenant', 'cus_usage_test')
     RETURNING id`
    );

    tenantId = tenant.rows[0].id;

    await pool.query(
        `INSERT INTO subscriptions (
       tenant_id,
       plan_id,
       stripe_subscription_id,
       status
     )
     VALUES ($1, $2, $3, 'active')`,
        [tenantId, plan.rows[0].id, "sub_usage_test"]
    );
});

afterAll(async () => {
    await pool.end();
});

function sendUsage(key, prompt = "Explain subscription billing.") {
    return request(app)
        .post("/usage/simulate")
        .set("X-Tenant-ID", String(tenantId))
        .set("Idempotency-Key", key)
        .send({ prompt });
}

describe("Phase 4 usage metering integration", () => {
    test("1. records token usage and calculates cost", async () => {
        const response = await sendUsage("usage-valid-001");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.usage.total_tokens).toBeGreaterThan(0);
        expect(Number(response.body.usage.total_cost)).toBeGreaterThanOrEqual(0);

        const result = await pool.query(
            `SELECT COUNT(*)::int AS count, SUM(total_tokens) AS tokens
       FROM usage_events
       WHERE tenant_id = $1`,
            [tenantId]
        );

        expect(result.rows[0].count).toBe(1);
        expect(Number(result.rows[0].tokens)).toBe(
            Number(response.body.usage.total_tokens)
        );
    });

    test("2. retrying the same idempotency key does not double-count", async () => {
        const first = await sendUsage("usage-retry-001");
        const second = await sendUsage("usage-retry-001");

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.duplicate).toBe(true);

        const result = await pool.query(
            `SELECT COUNT(*)::int AS count, SUM(total_tokens) AS tokens
       FROM usage_events
       WHERE tenant_id = $1`,
            [tenantId]
        );

        expect(result.rows[0].count).toBe(1);
        expect(Number(result.rows[0].tokens)).toBe(
            Number(first.body.usage.total_tokens)
        );
    });

    test("3. exceeding the monthly quota is rejected without recording usage", async () => {
        await pool.query(
            `UPDATE plans
       SET monthly_token_limit = 1
       WHERE id = (
         SELECT plan_id FROM subscriptions WHERE tenant_id = $1
       )`,
            [tenantId]
        );

        const response = await sendUsage("usage-over-limit-001");

        expect(response.status).toBe(429);
        expect(response.body.error).toBe("Monthly token limit exceeded");

        const result = await pool.query(
            "SELECT COUNT(*)::int AS count FROM usage_events WHERE tenant_id = $1",
            [tenantId]
        );

        expect(result.rows[0].count).toBe(0);
    });

    test("4. concurrent retries with the same key create one usage record", async () => {
        const responses = await Promise.all([
            sendUsage("usage-concurrent-001"),
            sendUsage("usage-concurrent-001"),
        ]);

        expect(responses.map((r) => r.status).sort()).toEqual([200, 200]);

        const result = await pool.query(
            `SELECT COUNT(*)::int AS count, SUM(total_tokens) AS tokens
       FROM usage_events
       WHERE tenant_id = $1
         AND idempotency_key = $2`,
            [tenantId, "usage-concurrent-001"]
        );

        expect(result.rows[0].count).toBe(1);
        expect(Number(result.rows[0].tokens)).toBeGreaterThan(0);
    });
});