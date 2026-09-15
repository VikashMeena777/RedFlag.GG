-- ═══════════════════════════════════════════════════════════════════════════
-- 008 — Payment Gateway switch: per-order paid idempotency
--
-- Billing moved from the Subscriptions API (never enabled on the merchant
-- account) to the standard Payment Gateway: Pro is now a one-time 30-day pass
-- per order, granted only in the webhook.
--
-- Cashfree can deliver more than one event for the same payment — notably both
-- ORDER_PAID and the older PAYMENT_SUCCESS shape, plus at-least-once retries.
-- Retries are already deduped by payments.event_id; this index adds the second
-- layer: at most ONE row with status 'ORDER_PAID' per order reference, so a
-- second event for the same purchase is rejected by the unique index and never
-- re-grants 30 days.
--
-- The reference stored in payments.cashfree_subscription_id is our own order
-- id (`rfgg_<user>_<nanoid>`), which is also what the webhook attributes the
-- payment by. The column name predates the switch and is reused rather than
-- renamed — renaming would touch the profiles guard trigger for no functional
-- gain.
-- ═══════════════════════════════════════════════════════════════════════════

create unique index if not exists payments_order_paid_uniq
  on public.payments (cashfree_subscription_id)
  where status = 'ORDER_PAID';
