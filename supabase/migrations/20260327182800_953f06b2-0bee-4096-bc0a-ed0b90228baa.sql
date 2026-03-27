
-- Audit logs table for tracking admin actions
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth can insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Add reviewed_by and reviewed_at to absence_justifications
ALTER TABLE public.absence_justifications
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Allow UPDATE on time_records for admin corrections
CREATE POLICY "Auth can update time records" ON public.time_records
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
