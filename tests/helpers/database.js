const pool = require('../../src/config/database');

async function clearDatabase() {
    await pool.query(`
        TRUNCATE TABLE 
            usage_events,
            idempotency_records,
            subscriptions,
            tenants,
            plans,
            webhook_events
            RESTART IDENTITY CASCADE;
    `);
}

async function closeDatabase() {
    await pool.end();
}

module.exports = { clearDatabase, closeDatabase }