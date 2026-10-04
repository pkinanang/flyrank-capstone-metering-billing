const pool = require('../config/database');

async function findTenantById(tenantId) {
    const result = await pool.query(
        `SELECT t.id, t.name FROM tenants t WHERE t.id = $1`,
        [tenantId]
    );

    return result.rows[0] || null;
}

async function getTenantSubscription(tenantId) {
    const result = await pool.query(
        `SELECT 
            s.id AS subscription_id,
            s.status,
            p.id AS plan_id,
            p.name AS plan_name,
            p.api_calls_limit,
            p.ai_token_limit
        FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        WHERE s.tenant_id = $1 
        ORDER BY s.created_at DESC
        LIMIT 1
        `,
        [tenantId]
    );

    return result.rows[0] || null;
}

module.exports = {
    findTenantById,
    getTenantSubscription
};

