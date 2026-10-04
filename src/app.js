const express = require("express");
const healthRoutes = require("./routes/health.routes");
const usageRoutes = require("./routes/usage.routes");
const generateRoutes = require("./routes/generate.routes");

const app = express();


app.use(express.json());

app.use("/health", healthRoutes);
app.use("/usage", usageRoutes);
app.use("/generate", generateRoutes);

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
