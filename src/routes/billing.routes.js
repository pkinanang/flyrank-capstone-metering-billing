const express = require("express");
const tenantRepository = require("../repositories/tenant.repository");
const billingRepository = require("../repositories/billing.repository");

const {
    createCustomer,
    createCheckoutSession,
} = require("../services/stripe.service");

const router = express.Router();

router.post("/checkout", async (req, res, next) => {
    try {
        const tenantID = req.header('X-Tenant-ID') || req.header('x-tenant-id');

        if (!tenantID) {
            return res.status(401).json({ error: "TENANT_NOT_FOUND" });
        }
        const tenant = await tenantRepository.findTenantById(tenantID);
        if (!tenant) {
            return res.status(404).json({ error: "TENANT_NOT_FOUND" });
        }

        // Get Pro Plan
        const subscription = await tenantRepository.getTenantSubscription(tenant.id);

        //Find Pro Plan
        const pool = require("../config/database");

        const result = await pool.query(
            `
    SELECT * FROM plans 
    WHERE name = 'Pro' LIMIT 1
    `
        );
        const plan = result.rows[0];

        if (!plan) {
            return res.status(404).json({ error: "PLAN_NOT_FOUND" });
        }
        if (!plan.stripe_price_id) {
            return res.status(500).json({ error: "STRIPE_PRICE_NOT_CONFIGURED" });
        }

        //Create Stripe Customer if not exist
        let customerId = tenant.stripe_customer_id;

        if (!customerId) {
            const customer = await createCustomer({ tenant });
            customerId = customer.id;

            await billingRepository.updateStripeCustomer({
                tenantId: tenant.id,
                stripeCustomerId: customerId,
            });
        }
        //create checkout session
        const session = await createCheckoutSession({
            customerId,
            priceId: plan.stripe_price_id,
            tenantId: tenantID,
        });
        return res.status(200).json({
            url: session.url,
            session_id: session.id,
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;