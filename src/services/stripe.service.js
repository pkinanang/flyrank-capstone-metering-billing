const stripe = require("../config/stripe");

async function createCustomer({ tenant, }) {


    const customer = await stripe.customers.create({
        name: tenant.name,
        metadata: {
            tenant_id: tenant.id,
        },
    });
    return customer;

}

async function createCheckoutSession({
    customerId,
    priceId,
    tenantId,

}) {
    const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        success_url: "http://localhost:3000/billing/success",

        cancel_url:
            "http://localhost:3000/billing/cancel",

        metadata: {
            tenant_id: tenantId,
        },
        subscription_data: {
            metadata: {
                tenant_id: tenantId,
            },
        },
    });
    return session;

}

module.exports = {
    createCustomer,
    createCheckoutSession,
};
