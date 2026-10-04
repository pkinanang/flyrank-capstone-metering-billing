const pool = require('../config/database');
//  find idempotency in idempotency_records table
async function findIdempotencyRecord(tenantId, idempotencyKey) {
    const result = await pool.query(
        `
        SELECT * FROM idempotency_records 
        WHERE tenant_id=$1 AND idempotency_key=$2
        
        `,
        [
            tenantId,
            idempotencyKey
        ]
    );
    return result.rows[0] || null;
}
// record idempotency in idempotency_records table
async function recordIdempotencyRecord(
    client,
    tenantId,
    idempotencyKey
) {
    // insert idempotency in idempotency_records table
    const result = await client.query(
        `
        INSERT INTO idempotency_records (
        tenant_id, 
        idempotency_key
    )
        VALUES ($1, $2)
        RETURNING *
        `,
        [
            tenantId,
            idempotencyKey
        ]
    );
    return result.rows[0];
}
// Save idempotency response
async function saveIdempotencyResponse(
    client,
    recordId,
    status,
    responseBody
) {
    await client.query(
        `
        UPDATE idempotency_records
        SET
            response_status = $1,
            response_body = $2
        WHERE id = $3
        `,
        [
            status,
            responseBody,
            recordId
        ]
    );
}
async function createUsageEvent(
    client,
    tenantId,
    usageType,
    quantity,
    requestId
) {
    const result = await client.query(
        `
        INSERT INTO usage_events(
            tenant_id,
            usage_type,
            quantity,
            request_id
        )
        VALUES($1,$2,$3,$4)
        RETURNING *
        `,
        [
            tenantId,
            usageType,
            quantity,
            requestId
        ]
    );
    return result.rows[0];
}
// get monthly usage
async function getMonthlyUsage(tenantId) {
    const result = await pool.query(
        `
        SELECT 
            usage_type,
            COALESCE(SUM(quantity), 0) AS total
        FROM usage_events
        WHERE tenant_id = $1
          AND created_at >= date_trunc('month', current_timestamp)
        GROUP BY usage_type
        `,
        [tenantId]
    );
    const usage = {
        api_calls: 0,
        ai_tokens: 0
    };
    for (const row of result.rows) {
        usage[row.usage_type] = Number(row.total);
    }
    return usage;
}

module.exports = {
    findIdempotencyRecord,
    recordIdempotencyRecord,
    saveIdempotencyResponse,
    createUsageEvent,
    getMonthlyUsage
};