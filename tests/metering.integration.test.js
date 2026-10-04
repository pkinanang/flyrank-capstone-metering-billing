const request = require("supertest");
const app = require("../src/app");
const pool = require("../src/config/database");
const { clearDatabase, closeDatabase } = require("./helpers/database");
const { createTestTenant } = require("./helpers/seed");

describe("POST /generate - Idempotency Integration Test", () => {
    let tenant;

    beforeEach(async () => {
        await clearDatabase();
        const data = await createTestTenant();
        tenant = data.tenant;
    });

    afterAll(async () => {
        await closeDatabase();
    });

    test("sequential duplicate request with same idempotency key records usage exactly once", async () => {
        const idempotencyKey = "sequential-request-001";
        const requestBody = {
            input_tokens: 500,
            cached_input_tokens: 100,
            output_tokens: 1000,
            reasoning_tokens: 200,
        };

        // First Request
        const firstResponse = await request(app)
            .post("/generate")
            .set("X-Tenant-ID", tenant.id)
            .set("Idempotency-Key", idempotencyKey)
            .send(requestBody);

        expect(firstResponse.status).toBe(201);

        // Second Request (Retry)
        const secondResponse = await request(app)
            .post("/generate")
            .set("X-Tenant-ID", tenant.id)
            .set("Idempotency-Key", idempotencyKey)
            .send(requestBody);

        expect(secondResponse.status).toBe(201);
        expect(secondResponse.body).toEqual(firstResponse.body);

        // Verify Database Usage
        const result = await pool.query(
            `
            SELECT usage_type, COUNT(*) AS count, SUM(quantity) AS total
            FROM usage_events
            WHERE tenant_id = $1
            GROUP BY usage_type
            `,
            [tenant.id]
        );

        const usage = {};
        for (const row of result.rows) {
            usage[row.usage_type] = {
                count: Number(row.count),
                total: Number(row.total),
            };
        }

        expect(usage.api_calls.count).toBe(1);
        expect(usage.api_calls.total).toBe(1);
        expect(usage.ai_tokens.count).toBe(1);
        expect(usage.ai_tokens.total).toBe(1800);

        // Verify Idempotency Record
        const idempotencyResult = await pool.query(
            `SELECT COUNT(*) AS count FROM idempotency_records WHERE tenant_id = $1 AND idempotency_key = $2`,
            [tenant.id, idempotencyKey]
        );
        expect(Number(idempotencyResult.rows[0].count)).toBe(1);
    });

    test("concurrent requests with same idempotency key record usage once", async () => {
        const idempotencyKey = "concurrent-request-001";
        const requestBody = {
            input_tokens: 500,
            cached_input_tokens: 100,
            output_tokens: 1000,
            reasoning_tokens: 200,
        };

        const requestOne = request(app)
            .post("/generate")
            .set("X-Tenant-ID", tenant.id)
            .set("Idempotency-Key", idempotencyKey)
            .send(requestBody);

        const requestTwo = request(app)
            .post("/generate")
            .set("X-Tenant-ID", tenant.id)
            .set("Idempotency-Key", idempotencyKey)
            .send(requestBody);

        const results = await Promise.all([requestOne, requestTwo]);

        expect(results[0].status).toBe(201);
        expect(results[1].status).toBe(201);
        expect(results[0].body).toEqual(results[1].body);

        // Check database
        const result = await pool.query(
            `
            SELECT usage_type, COUNT(*) AS count, SUM(quantity) AS total
            FROM usage_events
            WHERE tenant_id = $1
            GROUP BY usage_type
            `,
            [tenant.id]
        );

        const usage = {};
        for (const row of result.rows) {
            usage[row.usage_type] = {
                count: Number(row.count),
                total: Number(row.total),
            };
        }

        expect(usage.api_calls.count).toBe(1);
        expect(usage.api_calls.total).toBe(1);
        expect(usage.ai_tokens.count).toBe(1);
        expect(usage.ai_tokens.total).toBe(1800);
    });
});