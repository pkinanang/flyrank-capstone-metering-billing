const { checkQuota } = require("../src/services/quota.service");

describe(
    "Quota Service", () => {
        const plan = {
            api_call_limit: 1000,
            ai_token_limit: 100000,
        };
        test(
            "allow usage below quota", () => {
                const result = checkQuota(
                    {
                        api_calls: 998,
                        ai_tokens: 50000,
                    },
                    {
                        api_calls: 1,
                        ai_tokens: 1000,
                    },
                    plan
                );
                expect(result.allowed).toBe(true);
            }

        );
        test(
            "allows usage exactly at quota", () => {
                const result = checkQuota(
                    {
                        api_calls: 999,
                        ai_tokens: 50000,
                    },
                    {
                        api_calls: 1,
                        ai_tokens: 100,
                    },
                    plan
                );
                expect(result.allowed).toBe(true);
            }
        );

        test("rejects usage above quota", () => {
            const result = checkQuota(
                {
                    api_calls: 1000,
                    ai_tokens: 50000,
                },
                {
                    api_calls: 1,
                    ai_tokens: 100,
                },
                plan
            );
            expect(result.allowed).toBe(false);
            expect(result.statusCode).toBe(429);
        });

        test(
            "reject token usage above quota", () => {
                const result = checkQuota(
                    {
                        api_calls: 10,
                        ai_tokens: 99900,
                    },
                    {
                        api_calls: 1,
                        ai_token: 200,
                    },
                    plan
                );
                expect(result.allowed).toBe(false);
                expect(result.error).toBe("AI_TOKEN_QUOTA_EXCEEDED");
            }
        );
    }
);