const express = require("express");
const healthRoutes = require("./routes/health.routes");
const usageRoutes = require("./routes/usage.routes");
const generateRoutes = require("./routes/generate.routes");
const billingRoutes = require("./routes/billing.routes");
const stripeWebhookRoutes = require("./routes/stripe-webhook.routes");

const app = express();
app.use("/webhooks/stripe", stripeWebhookRoutes);//test target
app.use("/stripe-webhooks", stripeWebhookRoutes);//live target

app.use(express.json());


app.use("/health", healthRoutes);
app.use("/usage", usageRoutes);
app.use("/generate", generateRoutes);
app.use("/billing", billingRoutes);

app.use((error, req, res, next) => {
    console.error(
        error
    );
    res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpexted error occures.",
    });
})
module.exports = app;
