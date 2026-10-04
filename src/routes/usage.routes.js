const express = require("express");
const tenantRepository = require('../repositories/tenant.repository');
const usageRepository = require('../repositories/usage.repository');

const router = express.Router();

router.get("/", async (req, res, next) => {
    try {
        const tenantId = req.header("X-Tenant-ID") || req.header("x-tenant-id");

        if (!tenantId) {
            return res.status(400).json({
                error: "TENANT_ID_REQUIRED",
                message: "X-Tenant-ID Header is required."
            });
        }

        const subscription = await tenantRepository.getTenantSubscription(
            tenantId
        );

        if (!subscription) {
            return res.status(400).json({
                error: "SUBSCRIPTION_NOT_FOUND",
                message: "Tenant has no active subscription."
            });
        }

        const usage = await usageRepository.getMonthlyUsage(
            tenantId
        );

        return res.status(200).json({
            plan: subscription.plan_name,
            usage: {
                api_calls: {
                    used: usage.api_calls,
                    limit: subscription.api_call_limit
                },
                ai_tokens: {
                    used: usage.ai_tokens,
                    limit: subscription.ai_token_limit
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;

