
-- Fix existing subscriptions: normalize current_period_end to the 1st of the next month
-- For dates not already on the 1st, snap to the 1st of the following month
UPDATE subscriptions 
SET current_period_end = date_trunc('month', current_period_end) + interval '1 month'
WHERE current_period_end IS NOT NULL 
  AND extract(day FROM current_period_end) != 1;

-- Fix current_period_start to the 1st of that month
UPDATE subscriptions 
SET current_period_start = date_trunc('month', current_period_start)
WHERE current_period_start IS NOT NULL 
  AND extract(day FROM current_period_start) != 1;
