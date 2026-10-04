const express = require("express");
const { z } = require("zod");
const tenantRepository = require("../repositories/tenant.repository");
const { recordUsage } = require("../services/metering.service");
const router = express.Router();

const generateSchema = z.object({
    input_tokens: z.number().int().nonnegative().default(0),
    cached_input_tokens: z.number().int().nonnegative().default(0),
    output_tokens: z.number().int().nonnegative().default(0),
    reasoning_tokens: z.number().int().nonnegative().default(0),
});

// POST /generate - Metered AI generation endpoint
router.post("/", async (req, res, next) => {
    try {
        const tenantId = req.header("X-Tenant-ID") || req.header("x-tenant-id");
        const idempotencyKey = req.header("Idempotency-Key") || req.header("idempotency-key");

        // Validate Headers
        if (!tenantId) {
            return res.status(400).json({
                error: "TENANT_ID_REQUIRED",
                message: "Tenant ID is required to process request."
            });
        }

        if (!idempotencyKey) {
            return res.status(400).json({
                error: "IDEMPOTENCY_KEY_REQUIRED",
                message: "Idempotency key is required to prevent duplicate requests."
            });
        }

        // Validate Tenant
        const tenant = await tenantRepository.findTenantById(tenantId);
        if (!tenant) {
            return res.status(404).json({
                error: "TENANT_NOT_FOUND",
                message: "Tenant not found."
            });
        }

        // Validate Body
        const validation = generateSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: "VALIDATION_ERROR",
                details: validation.error.issues,
            });
        }

        const {
            input_tokens,
            cached_input_tokens,
            output_tokens,
            reasoning_tokens
        } = validation.data;

        // Calculate total AI tokens
        const aiTokens = input_tokens + cached_input_tokens + output_tokens + reasoning_tokens;

        const result = await recordUsage({
            tenantId,
            idempotencyKey,
            requestedUsage: {
                apiCalls: 1,
                ai_tokens: aiTokens,
            },
        });

        return res.status(result.statusCode).json(result.response);

    } catch (error) {
        next(error);
    }
});

module.exports = router;


