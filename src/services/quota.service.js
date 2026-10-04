function checkQuota(
    currentUsage = {},
    requestUsage = {},
    plan = {}
) {
    const apiCallsLimit = Number(plan.api_calls_limit ?? plan.api_call_limit ?? plan.apiCallsLimit ?? 0);
    const aiTokenLimit = Number(plan.ai_token_limit ?? plan.aiTokenLimit ?? 0);

    const currentApiCalls = Number(currentUsage.api_calls ?? currentUsage.apiCalls ?? 0);
    const currentAiTokens = Number(currentUsage.ai_tokens ?? currentUsage.aiToken ?? 0);

    const requestedApiCalls = Number(requestUsage.api_calls ?? requestUsage.apiCalls ?? 0);
    const requestedAiTokens = Number(requestUsage.ai_tokens ?? requestUsage.ai_token ?? requestUsage.aiToken ?? 0);

    const proposeApiUsage = currentApiCalls + requestedApiCalls;
    const proposeTokenUsage = currentAiTokens + requestedAiTokens;

    if (proposeApiUsage > apiCallsLimit) {
        return {
            allowed: false,
            statusCode: 429,
            error: "API_QUOTA_EXCEEDED",
            message: "Your monthly API limit has been reached."
        };
    }

    if (proposeTokenUsage > aiTokenLimit) {
        return {
            allowed: false,
            statusCode: 429,
            error: "AI_TOKEN_QUOTA_EXCEEDED",
            message: "Your monthly AI token limit has been reached."
        };
    }
    return {
        allowed: true
    };
}

module.exports = {
    checkQuota
};