const express = require("express");
const tenantMiddleware = require("../middleware/tenant.middleware");
const { recordUsage } = require("../services/usage.service");
const tenantRepository = require("../repositories/tenant.repository");
const usageRepository = require("../repositories/usage.repository");

const router = express.Router();

// GET /usage - Retrieve current monthly usage and quotas
router.get("/", tenantMiddleware, async (req, res, next) => {
    try {
        const tenantId = req.tenantId;
        const subscription = await tenantRepository.getTenantSubscription(tenantId);

        if (!subscription) {
            return res.status(400).json({
                error: "SUBSCRIPTION_NOT_FOUND",
                message: "Tenant has no active subscription.",
            });
        }

        const usage = await usageRepository.getMonthlyUsage(tenantId);

        return res.status(200).json({
            plan: subscription.plan_name,
            usage: {
                api_calls: {
                    used: usage.api_calls,
                    limit: subscription.api_calls_limit,
                },
                ai_tokens: {
                    used: usage.ai_tokens,
                    limit: subscription.ai_token_limit,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

// POST /usage & POST /usage/simulate - Metered AI simulation and cost tracking
router.post(["/simulate", "/"], tenantMiddleware, async (req, res) => {
    const idempotencyKey = req.header("Idempotency-Key");
    const { prompt } = req.body;

    if (
        !idempotencyKey ||
        idempotencyKey.length > 255 ||
        !prompt ||
        typeof prompt !== "string"
    ) {
        return res.status(400).json({
            error: "Idempotency-Key and a non-empty prompt are required",
        });
    }

    try {
        const result = await recordUsage({
            tenantId: req.tenantId,
            idempotencyKey,
            prompt,
        });

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        if (error.statusCode === 403 || error.statusCode === 429) {
            return res.status(error.statusCode).json({
                error: error.message,
                ...(error.details ? { details: error.details } : {}),
            });
        }

        console.error("Usage metering failed:", error.message);

        return res.status(500).json({
            error: "Unable to process usage",
        });
    }
});

module.exports = router;