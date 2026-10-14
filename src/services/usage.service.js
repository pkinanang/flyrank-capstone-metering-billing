const pool = require("../config/db");
const { simulateAI } = require("./token-simulator.service");
function formatUsageRow(row) {
    if (!row) return row;
    return {
        ...row,
        input_tokens: Number(row.input_tokens),
        output_tokens: Number(row.output_tokens),
        total_tokens: Number(row.total_tokens),
    };
}

// create a function to record usage
async function recordUsage({ tenantId, idempotencyKey, prompt }) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN"); // start a transaction to ensure atomicity

        // Serialize metering requests for the same tenant.
        const subscriptionResult = await client.query(
            `SELECT
         s.id AS subscription_id,
         s.status,
         p.id AS plan_id,
         p.monthly_token_limit,
         p.input_price_per_million,
         p.output_price_per_million
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.tenant_id = $1
         AND s.status = 'active'
       ORDER BY s.created_at DESC
       LIMIT 1
       FOR UPDATE OF s`,
            [tenantId]
        );

        if (subscriptionResult.rowCount === 0) {
            const error = new Error("No active subscription");
            error.statusCode = 403;
            throw error;
        }

        // Check idempotency inside the transaction.
        const existingResult = await client.query(
            `SELECT *
       FROM usage_events
       WHERE tenant_id = $1 AND idempotency_key = $2`,
            [tenantId, idempotencyKey]
        );
        // if the usage event already exists, return it
        if (existingResult.rowCount > 0) {
            await client.query("COMMIT");

            const existingUsage = formatUsageRow(existingResult.rows[0]);
            return {
                duplicate: true,
                outputText: `Simulated response: ${prompt.slice(0, 160)}`,
                usage: existingUsage,
            };
        }
        // get the subscription and plan information
        const subscription = subscriptionResult.rows[0];
        const simulated = simulateAI(prompt);

        // Monthly quota uses the calendar month in the database timezone.
        const usageResult = await client.query(
            `SELECT COALESCE(SUM(total_tokens), 0) AS used_tokens
       FROM usage_events
       WHERE tenant_id = $1
         AND created_at >= date_trunc('month', NOW())
         AND created_at < date_trunc('month', NOW()) + INTERVAL '1 month'`,
            [tenantId]
        );
        // calculate used tokens from the database query result
        const usedTokens = Number(usageResult.rows[0].used_tokens);
        const tokenLimit = Number(subscription.monthly_token_limit);

        if (usedTokens + simulated.totalTokens > tokenLimit) {
            const error = new Error("Monthly token limit exceeded");
            error.statusCode = 429;
            error.details = {
                usedTokens,
                tokenLimit,
                requestedTokens: simulated.totalTokens,
            };
            throw error;
        }

        const inputRate = Number(subscription.input_price_per_million);
        const outputRate = Number(subscription.output_price_per_million);

        const inputCost = (
            simulated.inputTokens * inputRate / 1_000_000
        ).toFixed(8);

        const outputCost = (
            simulated.outputTokens * outputRate / 1_000_000
        ).toFixed(8);

        const totalCost = (
            Number(inputCost) + Number(outputCost)
        ).toFixed(8);
        // insert the usage event into the database
        const insertResult = await client.query(
            `INSERT INTO usage_events (
         tenant_id,
         subscription_id,
         usage_type,
         quantity,
         idempotency_key,
         input_tokens,
         output_tokens,
         total_tokens,
         input_cost,
         output_cost,
         total_cost
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
            [
                tenantId,
                subscription.subscription_id,
                'ai_tokens',
                simulated.totalTokens,
                idempotencyKey,
                simulated.inputTokens,
                simulated.outputTokens,
                simulated.totalTokens,
                inputCost,
                outputCost,
                totalCost,
            ]
        );
        // commit the transaction
        await client.query("COMMIT");
        // return the usage event and the quota information
        return {
            duplicate: false,
            outputText: simulated.outputText,
            usage: formatUsageRow(insertResult.rows[0]),
            quota: {
                usedTokens: usedTokens + simulated.totalTokens,
                tokenLimit,
                remainingTokens: tokenLimit - usedTokens - simulated.totalTokens,
            },
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
// export the recordUsage function
module.exports = { recordUsage };