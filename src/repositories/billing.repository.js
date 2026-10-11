const pool = require("../config/database");

async function updateStripeCustomer({
    tenantId,
    stripeCustomerId,


}) {
    await pool.query(
        `
        UPDATE tenants
        SET stripe_customer_id = $1,
        updated_at = NOW()
        WHERE id = $2
        `,
        [stripeCustomerId, tenantId]
    );
}

async function findPlanByStripePrice({
    stripePriceId,
}) {

    const result = await pool.query(
        `
        SELECT *
        FROM plans
        WHERE stripe_price_id = $1
        `,
        [stripePriceId]
    );

    return result.rows[0] || null;

}

async function upsertSubscription({
    tenantId,
    planId,
    status,
    stripeSubscriptionId,
    currentPeriodStart,
    currentPeriodEnd,
}) {

    const result = await pool.query(
        `
        INSERT INTO subscriptions (tenant_id, plan_id, status,
        stripe_subscription_id,
        current_period_start,
        current_period_end
        )
        VALUES($1, $2, $3, $4, $5, $6)
        ON CONFLICT(tenant_id, plan_id)
        DO UPDATE SET
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        status = EXCLUDED.status,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        updated_at = CURRENT_TIMESTAMP
        RETURNING *;
        `,
        [
            tenantId,
            planId,
            status,
            stripeSubscriptionId,
            currentPeriodStart,
            currentPeriodEnd,
        ]
    );

    return result.rows[0];
}

async function updateSubcriptionStatus({
    stripeSubscriptionId,
    status
}) {
    const result = await pool.query(
        `
        UPDATE subscriptions
        SET status = $1,
        updated_at = CURRENT_TIMESTAMP
        WHERE stripe_subscription_id = $2
        RETURNING *;
        `,
        [status, stripeSubscriptionId]
    );
    return result.rows[0];
}

module.exports = {
    updateStripeCustomer,
    findPlanByStripePrice,
    upsertSubscription,
    updateSubcriptionStatus,
};