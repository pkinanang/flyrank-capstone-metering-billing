const express = require("express");
const router = express.Router();

// POST /webhooks/stripe - Environment ready endpoint (Phase 1)
router.post("/stripe", express.raw({ type: "application/json" }), (req, res) => {
    res.status(200).json({ received: true });
});

module.exports = router;
