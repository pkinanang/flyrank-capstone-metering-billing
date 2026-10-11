const express = require("express");
const stripe = require("../config/stripe");
const pool = require("../config/database");

const router = express.Router();

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    let event;

    // Verify the signature against the original, unparsed request body.
    try {
      if (!webhookSecret || !signature) {
        return res.status(400).json({
          error: "Missing webhook secret or signature",
        });
      }

      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        webhookSecret
      );
    } catch (error) {
      return res.status(400).json({
        error: "Invalid Stripe webhook signature",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // The unique constraint prevents concurrent duplicate processing.
      const inserted = await client.query(
        `INSERT INTO webhook_events (stripe_event_id, event_type)
         VALUES ($1, $2)
         ON CONFLICT (stripe_event_id) DO NOTHING
         RETURNING stripe_event_id`,
        [event.id, event.type]
      );

      if (inserted.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(200).json({
          received: true,
          duplicate: true,
        });
      }

      if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated"
      ) {
        const subscription = event.data.object;
        const tenantId = subscription.metadata?.tenant_id;
        const priceId = subscription.items?.data?.[0]?.price?.id;

        if (!tenantId || !priceId || !subscription.id) {
          throw new Error("Subscription is missing required metadata");
        }

        const planResult = await client.query(
          `SELECT id FROM plans WHERE stripe_price_id = $1`,
          [priceId]
        );

        if (planResult.rowCount === 0) {
          throw new Error(`No local plan found for Stripe price ${priceId}`);
        }

        const rawPeriodEnd =
          subscription.current_period_end ||
          subscription.items?.data?.[0]?.current_period_end;
        const periodEnd = rawPeriodEnd
          ? new Date(rawPeriodEnd * 1000)
          : null;

        const rawPeriodStart =
          subscription.current_period_start ||
          subscription.items?.data?.[0]?.current_period_start;
        const periodStart = rawPeriodStart
          ? new Date(rawPeriodStart * 1000)
          : null;

        await client.query(
          `INSERT INTO subscriptions (
             tenant_id,
             plan_id,
             stripe_subscription_id,
             status,
             current_period_start,
             current_period_end
           )
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (stripe_subscription_id)
           DO UPDATE SET
             tenant_id = EXCLUDED.tenant_id,
             plan_id = EXCLUDED.plan_id,
             status = EXCLUDED.status,
             current_period_start = EXCLUDED.current_period_start,
             current_period_end = EXCLUDED.current_period_end,
             updated_at = CURRENT_TIMESTAMP`,
          [
            tenantId,
            planResult.rows[0].id,
            subscription.id,
            subscription.status,
            periodStart,
            periodEnd,
          ]
        );
      } else if (event.type === "customer.subscription.deleted") {
        await client.query(
          `UPDATE subscriptions
           SET status = 'canceled',
               updated_at = CURRENT_TIMESTAMP
           WHERE stripe_subscription_id = $1`,
          [event.data.object.id]
        );
      }

      // Add more event handlers here as your billing rules require them.
      await client.query("COMMIT");

      return res.status(200).json({ received: true });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Stripe webhook processing failed:", error.message);

      // A non-2xx response lets Stripe retry after transient failures.
      return res.status(500).json({
        error: "Webhook processing failed",
      });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
