require("dotenv").config({ path: ".env.test" });

const request = require("supertest");
const Stripe = require("stripe");

const app = require("../src/app");
const pool = require("../src/config/db");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

let tenantId;
let planId;

function createSubscriptionEvent(eventId) {
    return {
        id: eventId,
        object: "event",
        api_version: null,
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: null,
        type: "customer.subscription.updated",
        data: {
            object: {
                id: "sub_test_phase3",
                object: "subscription",
                customer: "cus_test_phase3",
                status: "active",
                metadata: {
                    tenant_id: String(tenantId),
                },
                current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
                items: {
                    object: "list",
                    data: [
                        {
                            id: "si_test_phase3",
                            object: "subscription_item",
                            price: {
                                id: "price_test_phase3",
                                object: "price",
                            },
                        },
                    ],
                },
            },
        },
    };
}

function signedHeaders(payload) {
    const rawBody = JSON.stringify(payload);
    const signature = stripe.webhooks.generateTestHeaderString({
        payload: rawBody,
        secret: webhookSecret,
    });

    return {
        rawBody,
        headers: {
            "Content-Type": "application/json",
            "Stripe-Signature": signature,
        },
    };
}

async function sendSignedEvent(payload) {
    const { rawBody, headers } = signedHeaders(payload);

    return request(app)
        .post("/webhooks/stripe")
        .set(headers)
        .send(rawBody);
}

beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL must point to the test database");
    }

    if (!webhookSecret) {
        throw new Error("STRIPE_WEBHOOK_SECRET must be set in .env.test");
    }

    // Fail fast if the configured database isn't the test database.
    const dbResult = await pool.query("SELECT current_database() AS name");
    if (!dbResult.rows[0].name.endsWith("_test")) {
        throw new Error(
            `Refusing to run integration tests against ${dbResult.rows[0].name}`
        );
    }
});

beforeEach(async () => {
    await pool.query(
        `TRUNCATE TABLE webhook_events, subscriptions, tenants, plans
     RESTART IDENTITY CASCADE`
    );

    const plan = await pool.query(
        `INSERT INTO plans (name, stripe_price_id)
     VALUES ($1, $2)
     RETURNING id`,
        ["Pro", "price_test_phase3"]
    );

    planId = plan.rows[0].id;

    const tenant = await pool.query(
        `INSERT INTO tenants (name, stripe_customer_id)
     VALUES ($1, $2)
     RETURNING id`,
        ["Phase 3 Integration Tenant", "cus_test_phase3"]
    );

    tenantId = tenant.rows[0].id;
});

afterAll(async () => {
    await pool.end();
});

describe("Stripe webhook integration", () => {
    test("1. valid signature returns 200 and updates subscription state", async () => {
        const event = createSubscriptionEvent("evt_valid_phase3");

        const response = await sendSignedEvent(event);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });

        const subscriptionResult = await pool.query(
            `SELECT tenant_id, plan_id, stripe_subscription_id, status
       FROM subscriptions
       WHERE stripe_subscription_id = $1`,
            ["sub_test_phase3"]
        );

        expect(subscriptionResult.rowCount).toBe(1);
        expect(String(subscriptionResult.rows[0].tenant_id)).toBe(
            String(tenantId)
        );
        expect(String(subscriptionResult.rows[0].plan_id)).toBe(String(planId));
        expect(subscriptionResult.rows[0].status).toBe("active");

        const eventResult = await pool.query(
            `SELECT stripe_event_id
       FROM webhook_events
       WHERE stripe_event_id = $1`,
            ["evt_valid_phase3"]
        );

        expect(eventResult.rowCount).toBe(1);
    });

    test("2. invalid signature returns 400 and does not change the database", async () => {
        const event = createSubscriptionEvent("evt_invalid_phase3");
        const rawBody = JSON.stringify(event);

        const response = await request(app)
            .post("/webhooks/stripe")
            .set("Content-Type", "application/json")
            .set("Stripe-Signature", "t=123,v1=invalid_signature")
            .send(rawBody);

        expect(response.status).toBe(400);

        const subscriptions = await pool.query(
            "SELECT * FROM subscriptions"
        );
        const events = await pool.query(
            "SELECT * FROM webhook_events"
        );

        expect(subscriptions.rowCount).toBe(0);
        expect(events.rowCount).toBe(0);
    });

    test("3. duplicate event is processed once without duplicate effects", async () => {
        const event = createSubscriptionEvent("evt_duplicate_phase3");

        const firstResponse = await sendSignedEvent(event);
        const secondResponse = await sendSignedEvent(event);

        expect(firstResponse.status).toBe(200);
        expect(firstResponse.body).toEqual({ received: true });

        expect(secondResponse.status).toBe(200);
        expect(secondResponse.body).toEqual({
            received: true,
            duplicate: true,
        });

        const subscriptionResult = await pool.query(
            `SELECT *
       FROM subscriptions
       WHERE stripe_subscription_id = $1`,
            ["sub_test_phase3"]
        );

        const eventResult = await pool.query(
            `SELECT *
       FROM webhook_events
       WHERE stripe_event_id = $1`,
            ["evt_duplicate_phase3"]
        );

        expect(subscriptionResult.rowCount).toBe(1);
        expect(eventResult.rowCount).toBe(1);
    });
});