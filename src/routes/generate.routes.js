const express = require("express");
const router = express.Router();

// POST /api/generate - Metered AI generation endpoint
router.post("/", (req, res) => {
    const idempotencyKey = req.headers["idempotency-key"];

    if (!idempotencyKey) {
        return res.status(400).json({
            error: "Idempotency key is required",
            message: "Idempotency key is required to prevent duplicate requests"
        });
    }
    //
    const inputTokens = req.body.input_tokens ?? req.body.input_token ?? 0;
    const cachedInputTokens = req.body.cached_input_tokens ?? req.body.cached_input_token ?? 0;
    const outputTokens = req.body.output_tokens ?? req.body.output_token ?? 0;
    const reasoningTokens = req.body.reasoning_tokens ?? 0;

    const totalTokens = inputTokens + cachedInputTokens + outputTokens + reasoningTokens;

    return res.status(200).json({
        message: "Request processed successfully",
        idempotency_key: idempotencyKey,
        input_tokens: inputTokens,
        cached_input_tokens: cachedInputTokens,
        output_tokens: outputTokens,
        reasoning_tokens: reasoningTokens,
        total_tokens: totalTokens,
    });





});

module.exports = router;
