const pool = require('../config/database');
const usageRepository = require('../repositories/usage.repository');
const tenantRepository = require('../repositories/tenant.repository');
const { checkQuota } = require('./quota.service');

function isUniqueViolation(error) {
    return error.code === '23505';
}

async function recordUsage({
    tenantId,
    idempotencyKey,
    requestedUsage,
}) {
    /*
    * Step 1: Check whether this request has been processed before (Idempotency)
    */
    const existingRequest = await usageRepository.findIdempotencyRecord(
        tenantId,
        idempotencyKey
    );
    if (existingRequest && existingRequest.response_body) {
        return {
            duplicate: true,
            statusCode: existingRequest.response_status || 200,
            response: existingRequest.response_body,
        };
    }

    /*
    * Step 2: Get subscription Plan
    */
    const subscription = await tenantRepository.getTenantSubscription(
        tenantId
    );
    if (!subscription) {
        return {
            statusCode: 402,
            response: {
                error: "SUBSCRIPTION_REQUIRED",
                message: "No active subscription found.",
            },
        };
    }

    if (subscription.status !== 'active') {
        return {
            statusCode: 402,
            response: {
                error: "SUBSCRIPTION_INACTIVE",
                message: "Your subscription is inactive. Please renew your subscription to continue using the service.",
            },
        };
    }

    /*
    * Step 3: Get current monthly usage
    */
    const currentUsage = await usageRepository.getMonthlyUsage(
        tenantId
    );

    /*
    * Step 4: Check quota
    */
    const quotaResult = checkQuota(
        currentUsage,
        requestedUsage,
        subscription
    );
    if (!quotaResult.allowed) {
        return {
            statusCode: quotaResult.statusCode,
            response: {
                error: quotaResult.error,
                message: quotaResult.message,
            },
        };
    }

    /*
    * Step 5: Create Usage Events within Transaction
    */
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const idempotencyRecord = await usageRepository.recordIdempotencyRecord(
            client,
            tenantId,
            idempotencyKey
        );

        // Record API usage event
        await usageRepository.createUsageEvent(
            client,
            tenantId,
            'api_calls',
            requestedUsage.apiCalls,
            idempotencyRecord.id,
            idempotencyKey
        );

        //Record token usage
        await usageRepository.createUsageEvent(
            client,
            tenantId,
            'ai_tokens',
            requestedUsage.ai_tokens,
            idempotencyRecord.id
        );

        const response = {
            message: "Uasge recorded succesfuly.",
            usage: {
                api_calls: requestedUsage.apiCalls,
                ai_tokens: requestedUsage.ai_tokens,
            },
        };

        //Save original response

        await usageRepository.saveIdempotencyResponse(
            client,
            idempotencyRecord.id,
            201,
            response
        );
        await client.query(
            "COMMIT"
        );
        return {
            duplicate: false,
            statusCode: 201,
            response,
        };

    } catch (error) {
        await client.query(
            "ROLLBACK"
        );
        if (isUniqueViolation(error)) {
            const existingRecord = await usageRepository.findIdempotencyRecord(
                tenantId,
                idempotencyKey,
            );
            if (existingRecord) {
                return {
                    duplicate: true,
                    statusCode: existingRecord.response_status || 201,
                    response: existingRecord.response_body,
                };

            }
        }
        throw error;
    }
    finally {
        client.release();
    }


}



module.exports = {
    recordUsage,
};