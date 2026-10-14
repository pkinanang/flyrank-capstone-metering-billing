function estimateTokens(text = "") {
    // Simple deterministic estimate for the capstone.
    return Math.ceil(text.length / 4);
}

function simulateAI(prompt) {
    const inputTokens = estimateTokens(prompt);

    const outputText =
        `Simulated response: ${prompt.slice(0, 160)}`;

    const outputTokens = estimateTokens(outputText);

    return {
        outputText,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
    };
}

module.exports = {
    estimateTokens,
    simulateAI,
};