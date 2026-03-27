CREATE TABLE IF NOT EXISTS public.time_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  record_type TEXT NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  mode TEXT NOT NULL DEFAULT 'online',
  sync_status TEXT NOT NULL DEFAULT 'synced',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.time_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_time_records_employee_recorded_at
  ON public.time_records (employee_id, recorded_at DESC);

DROP POLICY IF EXISTS "Anyone can insert time records" ON public.time_records;
CREATE POLICY "Anyone can insert time records"
ON public.time_records
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = employee_id
      AND e.active = true
  )
);

DROP POLICY IF EXISTS "Anyone can view time records" ON public.time_records;
CREATE POLICY "Anyone can view time records"
ON public.time_records
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Auth can delete time records" ON public.time_records;
CREATE POLICY "Auth can delete time records"
ON public.time_records
FOR DELETE
TO authenticated
USING (true);