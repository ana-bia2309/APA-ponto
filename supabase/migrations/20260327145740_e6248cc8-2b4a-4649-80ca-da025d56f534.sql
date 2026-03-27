INSERT INTO public.time_records (id, employee_id, record_type, recorded_at, latitude, longitude, mode, sync_status, created_at)
SELECT id, employee_id, step, punched_at, latitude, longitude, 'online', 'synced', created_at
FROM public.punch_records
ON CONFLICT (id) DO NOTHING;