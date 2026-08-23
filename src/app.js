const express = require("express");
const healthRoutes = require("./routes/health.routes");
const usageRoutes = require("./routes/usage.routes");
const generateRoutes = require("./routes/generate.routes");
const webhookRoutes = require("./routes/webhook.routes");

const app = express();

app.use("/webhooks", webhookRoutes);
app.use("/api/webhooks", webhookRoutes);

app.use(express.json());

app.use("/health", healthRoutes);
app.use("/usage", usageRoutes);
app.use("/api/usage", usageRoutes);
app.use("/generate", generateRoutes);
app.use("/api/generate", generateRoutes);


module.exports = app;
