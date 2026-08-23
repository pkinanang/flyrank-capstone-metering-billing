const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    res.status(200).json({
        status: "Ok",
        service: "Usage and metering Billing",
    });
});

module.exports = router;