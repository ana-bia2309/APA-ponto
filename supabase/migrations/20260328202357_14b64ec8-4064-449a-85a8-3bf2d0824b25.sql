CREATE OR REPLACE FUNCTION public.get_today_records_for_employee(
  p_employee_id uuid,
  p_start_ts timestamptz,
  p_end_ts timestamptz
)
RETURNS TABLE(
  id uuid,
  employee_id uuid,
  record_type text,
  recorded_at timestamptz,
  latitude double precision,
  longitude double precision,
  mode text,
  sync_status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    tr.id,
    tr.employee_id,
    tr.record_type,
    tr.recorded_at,
    tr.latitude,
    tr.longitude,
    tr.mode,
    tr.sync_status,
    tr.created_at
  FROM public.time_records tr
  WHERE tr.employee_id = p_employee_id
    AND tr.recorded_at >= p_start_ts
    AND tr.recorded_at <= p_end_ts
  ORDER BY tr.recorded_at ASC;
$$;