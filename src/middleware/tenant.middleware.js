const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tenantMiddleware(req, res, next) {
    const tenantId = req.header("X-Tenant-ID") || req.header("x-tenant-id");

    if (!tenantId || (!UUID_REGEX.test(tenantId) && !/^\d+$/.test(tenantId))) {
        return res.status(400).json({
            error: "A valid X-Tenant-ID header is required",
        });
    }

    req.tenantId = tenantId;
    next();
}

module.exports = tenantMiddleware;