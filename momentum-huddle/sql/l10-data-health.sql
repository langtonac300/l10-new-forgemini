-- ============================================================================
-- MOMENTUM HUDDLE DATA HEALTH — one view the huddle app reads before trusting any number.
-- Writes ONLY to mktg_alex_langton_paid_media (the sanctioned write target).
-- Everything else is read-only. Paste + run section 1, then section 2 to verify.
--
-- Sources covered and why each check exists:
--   • al_leads_lifecycle_v1 (durable copy, THIS dataset) — the upstream build
--     went silently stale once and produced a false −58% leads read. Gate:
--     ≤ 8 days behind the spend mart (same rule the monthly deep dive uses).
--   • mtd_spend_pull_v3 (governed spend mart) — normal ops lag ≈ 1 day.
--   • Combined_order_items + aa_global_orders — the FT-CPC revenue basis
--     behind the A/S metrics rows; if either lags, A/S reads high.
--   • mktg_amazon (amazon_product_metrics / sb_query_metrics) — feeds the
--     Amazon A/S denominator; 14-day attribution means recent days restate,
--     but the tables themselves must be landing rows.
--   • SF_AllOpportunites_view — permanently frozen 2024-05-24; hard-coded
--     BROKEN so nothing downstream is ever tempted again.
--
-- Deliberately NOT referenced: mktg_temporary.al_leads_lifecycle_v1. That
-- table expires 2026-08-13 and a view referencing it would break on expiry.
-- Its preserve-gap check is section 3 (run manually until the expiry date).
--
-- Cost: five window-guarded MAX() scans; the 60-day guards keep bytes small.
-- Thresholds are encoded here (not in the app) so tuning is a view edit.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) CREATE THE VIEW  (safe to re-run any time — CREATE OR REPLACE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW `amasdataprd.mktg_alex_langton_paid_media.v_l10_data_health` AS
WITH
  spend AS (
    SELECT MAX(Date) AS max_d
    FROM `amasdataprd.mktg_mtd_spend_pull.mtd_spend_pull_v3`
    WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
  ),
  leads AS (
    SELECT MAX(DATE(form_dt)) AS max_d
    FROM `amasdataprd.mktg_alex_langton_paid_media.al_leads_lifecycle_v1`
  ),
  orders AS (
    SELECT MAX(order_date) AS max_d
    FROM `amasdataprd.mktg_marketing.Combined_order_items`
    WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
  ),
  adobe AS (
    SELECT MAX(date) AS max_d
    FROM `amasdataprd.mktg_adobe_analytics.aa_global_orders`
    WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
  ),
  amz_sp AS (
    SELECT MAX(date) AS max_d
    FROM `amasdataprd.mktg_amazon.amazon_product_metrics`
    WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
  ),
  amz_sb AS (
    SELECT MAX(date) AS max_d
    FROM `amasdataprd.mktg_amazon.sb_query_metrics`
    WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
  )

-- Spend mart: the clock every other window keys on. ~1-day lag is normal.
SELECT
  'spend_mart'                              AS source_key,
  'Spend mart (mtd_spend_pull_v3)'          AS source_label,
  s.max_d                                   AS last_data_date,
  DATE_DIFF(CURRENT_DATE(), s.max_d, DAY)   AS days_behind,
  CASE
    WHEN s.max_d IS NULL THEN 'BROKEN'
    WHEN DATE_DIFF(CURRENT_DATE(), s.max_d, DAY) <= 2 THEN 'FRESH'
    WHEN DATE_DIFF(CURRENT_DATE(), s.max_d, DAY) <= 3 THEN 'LAG'
    ELSE 'STALE'
  END                                       AS status,
  'Feeds all pacing + the A/S spend side. Normal ops lag is 1 day.' AS detail
FROM spend s

UNION ALL
-- Leads lifecycle (durable copy): gated against the SPEND clock, not the wall
-- clock, exactly like the deep dive (LEADS_STALE_DAYS = 8). A quiet upstream
-- here is how the false −58% happened.
SELECT
  'leads_lifecycle',
  'Leads lifecycle (al_leads_lifecycle_v1)',
  l.max_d,
  DATE_DIFF(s.max_d, l.max_d, DAY),
  CASE
    WHEN l.max_d IS NULL THEN 'BROKEN'
    WHEN s.max_d IS NULL THEN 'UNKNOWN'
    WHEN DATE_DIFF(s.max_d, l.max_d, DAY) <= 8 THEN 'FRESH'
    ELSE 'STALE'
  END,
  'Form fills, first_touch_channel = ppc. Stale = any lead trend is a lie.'
FROM leads l CROSS JOIN spend s

UNION ALL
-- Web-order revenue basis (the A/S denominator for Brady + Seton/Emedco).
SELECT
  'web_orders',
  'Web orders (Combined_order_items)',
  o.max_d,
  DATE_DIFF(CURRENT_DATE(), o.max_d, DAY),
  CASE
    WHEN o.max_d IS NULL THEN 'BROKEN'
    WHEN DATE_DIFF(CURRENT_DATE(), o.max_d, DAY) <= 3 THEN 'FRESH'
    WHEN DATE_DIFF(CURRENT_DATE(), o.max_d, DAY) <= 5 THEN 'LAG'
    ELSE 'STALE'
  END,
  'Order revenue for A/S. Lagging orders make A/S read HIGH (spend ÷ less revenue).'
FROM orders o

UNION ALL
-- Adobe first-touch attribution feed (the ppc% filter side of the A/S join).
SELECT
  'adobe_orders',
  'Adobe first-touch (aa_global_orders)',
  a.max_d,
  DATE_DIFF(CURRENT_DATE(), a.max_d, DAY),
  CASE
    WHEN a.max_d IS NULL THEN 'BROKEN'
    WHEN DATE_DIFF(CURRENT_DATE(), a.max_d, DAY) <= 3 THEN 'FRESH'
    WHEN DATE_DIFF(CURRENT_DATE(), a.max_d, DAY) <= 5 THEN 'LAG'
    ELSE 'STALE'
  END,
  'If this lags behind Combined_order_items, recent orders lose ppc attribution and A/S reads HIGH.'
FROM adobe a

UNION ALL
-- Amazon SP metrics (advertised-only sales feed the Amazon A/S denominator).
SELECT
  'amazon_sp',
  'Amazon SP (amazon_product_metrics)',
  p.max_d,
  DATE_DIFF(CURRENT_DATE(), p.max_d, DAY),
  CASE
    WHEN p.max_d IS NULL THEN 'BROKEN'
    WHEN DATE_DIFF(CURRENT_DATE(), p.max_d, DAY) <= 3 THEN 'FRESH'
    WHEN DATE_DIFF(CURRENT_DATE(), p.max_d, DAY) <= 5 THEN 'LAG'
    ELSE 'STALE'
  END,
  '14-day attribution restates recent days — early-month A/S reads high by design; this only checks rows are landing.'
FROM amz_sp p

UNION ALL
-- Amazon SB metrics.
SELECT
  'amazon_sb',
  'Amazon SB (sb_query_metrics)',
  b.max_d,
  DATE_DIFF(CURRENT_DATE(), b.max_d, DAY),
  CASE
    WHEN b.max_d IS NULL THEN 'BROKEN'
    WHEN DATE_DIFF(CURRENT_DATE(), b.max_d, DAY) <= 3 THEN 'FRESH'
    WHEN DATE_DIFF(CURRENT_DATE(), b.max_d, DAY) <= 5 THEN 'LAG'
    ELSE 'STALE'
  END,
  'SB side of the trusted SP(is_advertised)+SB Amazon number.'
FROM amz_sb b

UNION ALL
-- Salesforce opportunities: permanently frozen. Hard-coded so no dashboard,
-- pull, or analyst is ever tempted to read it again.
SELECT
  'sf_opportunities',
  'SF_AllOpportunites_view',
  DATE '2024-05-24',
  DATE_DIFF(CURRENT_DATE(), DATE '2024-05-24', DAY),
  'BROKEN',
  'Frozen since 2024-05-24. Never use for anything current.'

UNION ALL
-- Upstream reminder: the mktg_temporary source copy of the leads table
-- expires 2026-08-13. After that date the durable copy in this dataset is
-- the only source — expected, not an error.
SELECT
  'leads_upstream_expiry',
  'Leads upstream (mktg_temporary copy)',
  DATE '2026-08-13',
  DATE_DIFF(CURRENT_DATE(), DATE '2026-08-13', DAY),
  IF(CURRENT_DATE() <= DATE '2026-08-13', 'LAG', 'FRESH'),
  IF(CURRENT_DATE() <= DATE '2026-08-13',
     'Run the preserve check (section 3 of l10-data-health.sql) before this date.',
     'Expired as planned — durable copy is the source of record.');

-- ---------------------------------------------------------------------------
-- 2) VERIFY  (run after creating; ~8 rows, one per source)
--
-- Expected TODAY: spend_mart FRESH (last_data_date = yesterday or the day
-- before) · leads_lifecycle FRESH with days_behind ≤ 8 (if STALE, the leads
-- pipeline is quiet again — investigate before quoting ANY lead number) ·
-- web_orders + adobe_orders FRESH/LAG · amazon_sp + amazon_sb FRESH/LAG ·
-- sf_opportunities BROKEN (permanent) · leads_upstream_expiry LAG until
-- 2026-08-13. Reconcile check: spend_mart.last_data_date should equal the
-- Financial Dashboard v2 C2 date. If those two disagree, the dashboard
-- refresh is behind the mart — refresh before reading pacing.
-- ---------------------------------------------------------------------------
SELECT *
FROM `amasdataprd.mktg_alex_langton_paid_media.v_l10_data_health`
ORDER BY
  CASE status WHEN 'BROKEN' THEN 0 WHEN 'STALE' THEN 1 WHEN 'LAG' THEN 2
              WHEN 'UNKNOWN' THEN 3 ELSE 4 END,
  source_key;

-- ---------------------------------------------------------------------------
-- 3) PRESERVE-GAP CHECK  (run manually until 2026-08-13, then never again)
--
-- Compares the expiring mktg_temporary copy against the durable copy here.
-- Expected: missing_in_durable = 0. If > 0, run P2 of
-- scripts/bigquery-census/al-leads-preserve.sql before the expiry date.
-- Kept OUT of the view on purpose: a view referencing mktg_temporary would
-- break the moment the table expires.
-- ---------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM `amasdataprd.mktg_temporary.al_leads_lifecycle_v1`)  AS temp_rows,
  (SELECT COUNT(*) FROM `amasdataprd.mktg_alex_langton_paid_media.al_leads_lifecycle_v1`) AS durable_rows,
  (SELECT COUNT(*)
   FROM `amasdataprd.mktg_temporary.al_leads_lifecycle_v1` s
   WHERE s.form_submit_id NOT IN (
     SELECT form_submit_id
     FROM `amasdataprd.mktg_alex_langton_paid_media.al_leads_lifecycle_v1`)) AS missing_in_durable;
