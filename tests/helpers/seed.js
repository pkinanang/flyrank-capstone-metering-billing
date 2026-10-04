const pool =
    require("../../src/config/database");

async function createTestTenant() {
    const planResult =
        await pool.query(
            `
      INSERT INTO plans (
        name,
        api_calls_limit,
        ai_token_limit,
        monthly_price
      )
      VALUES (
        'Free',
        1000,
        100000,
        0
      )
      RETURNING *
      `
        );

    const plan =
        planResult.rows[0];


    const tenantResult =
        await pool.query(
            `
      INSERT INTO tenants (
        name
      )
      VALUES (
        'Integration Test Company'
      )
      RETURNING *
      `
        );

    const tenant =
        tenantResult.rows[0];


    await pool.query(
        `
    INSERT INTO subscriptions (
      tenant_id,
      plan_id,
      status
    )
    VALUES (
      $1,
      $2,
      'active'
    )
    `,
        [
            tenant.id,
            plan.id,
        ]
    );


    return {
        tenant,
        plan,
    };
}

module.exports = {
    createTestTenant,
};